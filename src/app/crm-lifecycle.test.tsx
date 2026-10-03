import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { EffectivePermissions } from '@/shared/auth/effective-permissions';
import { CUSTOMER, VEHICLE, IDS, TIME, errorResponse, jsonResponse, renderReception, type Call } from '@/test/render-reception';

const PERMISSIONS: EffectivePermissions = ['customers.read', 'customers.update', 'vehicles.read', 'vehicles.update']
  .map(code => ({ code, scopes: ['tenant', 'assigned'] }));
const main = () => within(screen.getByRole('main'));
function change(label: string, value: string) {
  fireEvent.change(main().getByLabelText(label), { target: { value } });
}
function equivalentPermissions(reordered: boolean): EffectivePermissions {
  return reordered ? [...PERMISSIONS].reverse().flatMap(p => [
    { code: p.code, scopes: ['assigned', 'tenant', 'tenant'] },
    { code: p.code, scopes: ['assigned'] },
  ]) : PERMISSIONS.map(p => ({ code: p.code, scopes: [...p.scopes] }));
}
function response(call: Call) {
  if (call.url.pathname === '/api/v1/customers') return jsonResponse({ customers: [CUSTOMER], nextCursor: null });
  if (call.url.pathname === '/api/v1/vehicles') return jsonResponse({ vehicles: [VEHICLE], nextCursor: null });
  return jsonResponse(call.url.pathname.includes('/customers/') ? { customer: CUSTOMER } : { vehicle: VEHICLE });
}
function readBody(body: unknown): unknown {
  if (typeof body !== 'string') throw new Error('Expected JSON body');
  return JSON.parse(body) as unknown;
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('Uninitialized promise'); };
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('CRM permission refresh lifecycle', () => {
  it.each([
    ['customer', `/clientes/${IDS.customer}/editar`, 'Nombre *', CUSTOMER.firstName],
    ['vehicle', `/vehiculos/${IDS.vehicle}/editar`, 'Marca *', VEHICLE.brand],
  ])('equivalent new arrays preserve %s edits and dirty fields', async (_resource, path, label, original) => {
    const view = renderReception(path, response, PERMISSIONS);
    await main().findByDisplayValue(original);
    change(label, 'Edición local');
    const initialCalls = view.calls.length;
    for (const reordered of [false, true]) {
      view.updateRuntime({ ...view.runtime, permissions: equivalentPermissions(reordered) });
      await act(async () => { await Promise.resolve(); });
      expect(main().getByDisplayValue('Edición local')).toBeDefined();
      expect(view.calls).toHaveLength(initialCalls);
      expect(view.calls[0]?.init.signal?.aborted).toBe(false);
    }
    fireEvent.click(main().getByRole('button', { name: 'Guardar' }));
    await waitFor(() => { expect(view.calls.some(c => c.init.method === 'PATCH')).toBe(true); });
    expect(readBody(view.calls.find(c => c.init.method === 'PATCH')?.init.body))
      .toEqual({ expectedUpdatedAt: TIME, [label === 'Nombre *' ? 'firstName' : 'brand']: 'Edición local' });
  });

  it.each([
    ['/clientes', 'name', 'Nombre del cliente', 'Ana'],
    ['/clientes', 'phone', 'Teléfono del cliente', CUSTOMER.phone],
    ['/clientes', 'documentNumber', 'Documento del cliente', '1234567'],
    ['/vehiculos', 'plate', 'Buscar por placa', VEHICLE.plate],
  ])('equivalent refresh preserves %s filter %s and its results', async (path, field, label, value) => {
    const view = renderReception(path, call => {
      if (path === '/clientes') return jsonResponse({ customers: [{ ...CUSTOMER, firstName: call.url.searchParams.has(field) ? 'Filtrado' : 'General' }], nextCursor: null });
      return jsonResponse({ vehicles: [{ ...VEHICLE, plate: call.url.searchParams.has(field) ? 'FILTER123' : 'GENERAL123' }], nextCursor: null });
    }, PERMISSIONS);
    await main().findByRole('link', { name: path === '/clientes' ? 'General Prueba' : 'GENERAL123' });
    if (path === '/clientes') change('Buscar por', field);
    change(label, value);
    fireEvent.click(main().getByRole('button', { name: 'Buscar' }));
    await main().findByRole('link', { name: path === '/clientes' ? 'Filtrado Prueba' : 'FILTER123' });
    const initialCalls = view.calls.length;
    view.updateRuntime({ ...view.runtime, permissions: equivalentPermissions(true) });
    await act(async () => { await Promise.resolve(); });
    expect(main().getByDisplayValue(value)).toBeDefined();
    expect(main().getByRole('link', { name: path === '/clientes' ? 'Filtrado Prueba' : 'FILTER123' })).toBeDefined();
    expect(main().queryByRole('link', { name: path === '/clientes' ? 'General Prueba' : 'GENERAL123' })).toBeNull();
    expect(view.calls).toHaveLength(initialCalls);
    expect(view.calls.at(-1)?.url.searchParams.get(field)).toBe(value);
  });

  it.each(['/clientes', '/vehiculos'])('equivalent refresh during filtered pending %s finishes without reset', async path => {
    const pending = deferred<ReturnType<typeof jsonResponse>>();
    const field = path === '/clientes' ? 'name' : 'plate';
    const view = renderReception(path, call => call.url.searchParams.has(field) ? pending.promise : response(call), PERMISSIONS);
    await main().findByRole('link', { name: path === '/clientes' ? 'Ana Prueba' : VEHICLE.plate });
    change(path === '/clientes' ? 'Nombre del cliente' : 'Buscar por placa', 'LOCAL123');
    fireEvent.click(main().getByRole('button', { name: 'Buscar' }));
    await waitFor(() => { expect(view.calls).toHaveLength(2); });
    view.updateRuntime({ ...view.runtime, permissions: equivalentPermissions(false) });
    view.updateRuntime({ ...view.runtime, permissions: equivalentPermissions(true) });
    expect(view.calls[1]?.init.signal?.aborted).toBe(false);
    await act(async () => {
      pending.resolve(jsonResponse(path === '/clientes' ? { customers: [{ ...CUSTOMER, firstName: 'Filtrado' }], nextCursor: null } : { vehicles: [{ ...VEHICLE, plate: 'FILTER123' }], nextCursor: null }));
      await pending.promise;
    });
    expect(await main().findByRole('link', { name: path === '/clientes' ? 'Filtrado Prueba' : 'FILTER123' })).toBeDefined();
    expect(main().getByRole('button', { name: 'Buscar' }).hasAttribute('disabled')).toBe(false);
    expect(main().getByDisplayValue('LOCAL123')).toBeDefined();
    expect(view.calls).toHaveLength(2);
  });

  it.each(['/clientes', '/vehiculos'])('real scope revocation aborts %s, discards stale results and recovers on regrant', async path => {
    const pending = deferred<ReturnType<typeof jsonResponse>>();
    let first = true;
    const view = renderReception(path, call => {
      if (first) { first = false; return pending.promise; }
      return response(call);
    }, PERMISSIONS);
    await waitFor(() => { expect(view.calls).toHaveLength(1); });
    const code = path === '/clientes' ? 'customers.read' : 'vehicles.read';
    view.updateRuntime({ ...view.runtime, permissions: PERMISSIONS.map(p => p.code === code ? { ...p, scopes: ['quality_control'] } : p) });
    expect(await main().findByRole('alert')).toBeDefined();
    expect(view.calls[0]?.init.signal?.aborted).toBe(true);
    await act(async () => { pending.resolve(jsonResponse(path === '/clientes' ? { customers: [{ ...CUSTOMER, firstName: 'Stale' }], nextCursor: null } : { vehicles: [{ ...VEHICLE, plate: 'STALE123' }], nextCursor: null })); await pending.promise; });
    expect(main().queryByText(/Stale|STALE123/)).toBeNull();
    expect(main().queryByRole('button', { name: 'Buscar' })).toBeNull();
    view.updateRuntime({ ...view.runtime, permissions: equivalentPermissions(true) });
    expect(await main().findByRole('link', { name: path === '/clientes' ? 'Ana Prueba' : VEHICLE.plate })).toBeDefined();
    expect(main().getByRole('button', { name: 'Buscar' }).hasAttribute('disabled')).toBe(false);
    expect(view.calls).toHaveLength(2);
  });

  it('real revocation clears existing CRM edits and remote data', async () => {
    const view = renderReception(`/clientes/${IDS.customer}/editar`, response, PERMISSIONS);
    await main().findByDisplayValue(CUSTOMER.firstName);
    change('Nombre *', 'Edición local');
    view.updateRuntime({ ...view.runtime, permissions: PERMISSIONS.filter(p => p.code !== 'customers.update') });
    expect(await main().findByRole('alert')).toBeDefined();
    expect(main().queryByDisplayValue('Edición local')).toBeNull();
    expect(main().queryByRole('button', { name: 'Guardar' })).toBeNull();
  });
});

describe('CRM OCC explicit restore-to-original', () => {
  it('customer A → B → A survives remote C and resubmits A with exact new token', async () => {
    const remoteToken = '2026-10-02T15:04:05.000001Z';
    let reads = 0;
    let patches = 0;
    const latest = { ...CUSTOMER, firstName: 'Remoto C', phone: '+5711111111', updatedAt: remoteToken };
    const view = renderReception(`/clientes/${IDS.customer}/editar`, call => {
      if (call.init.method === 'PATCH') return ++patches === 1 ? errorResponse('RESOURCE_VERSION_CONFLICT') : jsonResponse({ customer: { ...latest, firstName: CUSTOMER.firstName } });
      return jsonResponse({ customer: ++reads === 1 ? CUSTOMER : latest });
    }, PERMISSIONS);
    await main().findByDisplayValue(CUSTOMER.firstName);
    change('Nombre *', 'Local B');
    change('Nombre *', CUSTOMER.firstName);
    fireEvent.click(main().getByRole('button', { name: 'Guardar' }));
    await main().findByRole('button', { name: 'He revisado la versión actual' });
    expect(main().getByDisplayValue(CUSTOMER.firstName)).toBeDefined();
    expect(main().getByDisplayValue(latest.phone)).toBeDefined();
    expect(main().getByText('Nombre actual')).toBeDefined();
    expect(main().getByText('Remoto C')).toBeDefined();
    expect(main().getByRole('button', { name: 'Guardar' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(main().getByRole('button', { name: 'He revisado la versión actual' }));
    fireEvent.click(main().getByRole('button', { name: 'Guardar' }));
    await waitFor(() => { expect(patches).toBe(2); });
    const payloads = view.calls.filter(c => c.init.method === 'PATCH').map(c => readBody(c.init.body));
    expect(payloads).toEqual([{ expectedUpdatedAt: TIME, firstName: CUSTOMER.firstName }, { expectedUpdatedAt: remoteToken, firstName: CUSTOMER.firstName }]);
  });

  it('vehicle A → B → A survives remote C and resubmits A with exact new token', async () => {
    const remoteToken = '2026-10-02T15:04:05.987654Z';
    let reads = 0;
    let patches = 0;
    const latest = { ...VEHICLE, brand: 'Remoto C', color: 'Azul remoto', updatedAt: remoteToken };
    const view = renderReception(`/vehiculos/${IDS.vehicle}/editar`, call => {
      if (call.init.method === 'PATCH') return ++patches === 1 ? errorResponse('RESOURCE_VERSION_CONFLICT') : jsonResponse({ vehicle: { ...latest, brand: VEHICLE.brand } });
      return jsonResponse({ vehicle: ++reads === 1 ? VEHICLE : latest });
    }, PERMISSIONS);
    await main().findByDisplayValue(VEHICLE.brand);
    change('Marca *', 'Local B');
    change('Marca *', VEHICLE.brand);
    fireEvent.click(main().getByRole('button', { name: 'Guardar' }));
    await main().findByRole('button', { name: 'He revisado la versión actual' });
    expect(main().getByDisplayValue(VEHICLE.brand)).toBeDefined();
    expect(main().getByDisplayValue(latest.color)).toBeDefined();
    expect(main().getByText('Marca actual')).toBeDefined();
    expect(main().getByText('Remoto C')).toBeDefined();
    fireEvent.click(main().getByRole('button', { name: 'He revisado la versión actual' }));
    fireEvent.click(main().getByRole('button', { name: 'Guardar' }));
    await waitFor(() => { expect(patches).toBe(2); });
    const payloads = view.calls.filter(c => c.init.method === 'PATCH').map(c => readBody(c.init.body));
    expect(payloads).toEqual([{ expectedUpdatedAt: TIME, brand: VEHICLE.brand }, { expectedUpdatedAt: remoteToken, brand: VEHICLE.brand }]);
  });
});

describe('CRM equivalent refresh during editor actions', () => {
  it.each([
    [`/clientes/${IDS.customer}/editar`, CUSTOMER.firstName],
    [`/vehiculos/${IDS.vehicle}/editar`, VEHICLE.brand],
  ])('pending initial editor load stays coherent: %s', async (path, original) => {
    const pending = deferred<ReturnType<typeof jsonResponse>>();
    const view = renderReception(path, () => pending.promise, PERMISSIONS);
    await waitFor(() => { expect(view.calls).toHaveLength(1); });
    view.updateRuntime({ ...view.runtime, permissions: equivalentPermissions(true) });
    expect(view.calls[0]?.init.signal?.aborted).toBe(false);
    await act(async () => {
      pending.resolve(jsonResponse(path.startsWith('/clientes') ? { customer: CUSTOMER } : { vehicle: VEHICLE }));
      await pending.promise;
    });
    expect(await main().findByDisplayValue(original)).toBeDefined();
    expect(main().getByRole('button', { name: 'Guardar' }).hasAttribute('disabled')).toBe(false);
    expect(view.calls).toHaveLength(1);
  });

  it.each([
    [`/clientes/${IDS.customer}/editar`, 'Nombre *', CUSTOMER.firstName],
    [`/vehiculos/${IDS.vehicle}/editar`, 'Marca *', VEHICLE.brand],
  ])('pending PATCH remains usable and retains edit after equivalent refresh: %s', async (path, label, original) => {
    const pending = deferred<ReturnType<typeof jsonResponse>>();
    const view = renderReception(path, call => call.init.method === 'PATCH' ? pending.promise : response(call), PERMISSIONS);
    await main().findByDisplayValue(original);
    change(label, 'Edición pendiente');
    fireEvent.click(main().getByRole('button', { name: 'Guardar' }));
    await waitFor(() => { expect(view.calls.some(c => c.init.method === 'PATCH')).toBe(true); });
    view.updateRuntime({ ...view.runtime, permissions: equivalentPermissions(true) });
    await act(async () => {
      pending.resolve(errorResponse('INTERNAL_ERROR', 500));
      await pending.promise;
    });
    expect(await main().findByRole('alert')).toBeDefined();
    expect(main().getByDisplayValue('Edición pendiente')).toBeDefined();
    expect(main().getByRole('button', { name: 'Guardar' }).hasAttribute('disabled')).toBe(false);
    expect(view.calls.filter(c => c.init.method === 'PATCH')).toHaveLength(1);
  });
});
