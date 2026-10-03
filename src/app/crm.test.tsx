import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { EffectivePermissions } from '@/shared/auth/effective-permissions';
import { CUSTOMER, VEHICLE, OWNER, IDS, TIME, errorResponse, jsonResponse, renderReception, type Call } from '@/test/render-reception';
const PERMISSIONS: EffectivePermissions = ['customers.read', 'customers.create', 'customers.update', 'vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicle_owners.manage', 'dashboard.operational.read'].map(code => ({ code, scopes: ['tenant'] }));
const TECH = { vehicleId: VEHICLE.vehicleId, plate: VEHICLE.plate, vehicleType: VEHICLE.vehicleType, brand: VEHICLE.brand, model: VEHICLE.model, modelYear: VEHICLE.modelYear, color: VEHICLE.color };
function response(call: Call) {
  const route = call.url.pathname;
  if (route.endsWith('/owners')) return jsonResponse({ owners: [OWNER] });
  if (route.endsWith('/customers')) return jsonResponse({ customers: [CUSTOMER], nextCursor: null });
  if (route.endsWith('/vehicles')) return jsonResponse({ vehicles: [VEHICLE], nextCursor: null });
  if (route.includes('/customers/')) return jsonResponse({ customer: CUSTOMER });
  return jsonResponse({ vehicle: VEHICLE });
}
const main = () => within(screen.getByRole('main'));
const change = (label: string, value: string) => { fireEvent.change(main().getByLabelText(label, { exact: false }), { target: { value } }); };
const save = () => { fireEvent.click(main().getByRole('button', { name: 'Guardar' })); };
describe('Clientes CRM', () => {
  it('lista tenant, detalle, acciones y navegación del shell', async () => {
    const view = renderReception('/clientes', response, PERMISSIONS);
    expect(await main().findByRole('link', { name: 'Ana Prueba' })).toBeDefined();
    expect(main().getByRole('link', { name: '+ Nuevo cliente' })).toBeDefined();
    expect(new Headers(view.calls[0]?.init.headers).get('X-Tenant-Id')).toBe(IDS.tenant);
    fireEvent.click(main().getByRole('link', { name: 'Ana Prueba' }));
    expect(await main().findByRole('heading', { name: 'Ana Prueba', level: 1 })).toBeDefined();
    expect(main().getByText(CUSTOMER.phone)).toBeDefined();
    expect(main().getByRole('link', { name: 'Editar cliente' })).toBeDefined();
    expect(view.calls.every(c => c.init.method === 'GET')).toBe(true);
    expect(main().queryByText(IDS.customer)).toBeNull();
    expect(main().queryByRole('button', { name: /Eliminar|Archivar/ })).toBeNull();
    expect(view.calls.some(c => c.url.pathname.endsWith('/vehicles'))).toBe(false);
  });
  it.each(['assigned', 'quality_control'])('deniega lista y detalle customer con scope %s', async scope => {
    const view = renderReception('/clientes', response, [{ code: 'customers.read', scopes: [scope] }]);
    expect(await main().findByRole('alert')).toBeDefined();
    expect(view.calls).toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'Clientes' })).toBeNull();
  });
  it.each([['Nombre', 'name', 'Ana'], ['Teléfono', 'phone', '+5700000000'], ['Documento', 'documentNumber', '1234567']])('búsqueda %s explícita y limpiar', async (label, query, value) => {
    const view = renderReception('/clientes', response, PERMISSIONS);
    await main().findByRole('link', { name: 'Ana Prueba' });
    change('Buscar por', query);
    change(`${label} del cliente`, value);
    expect(view.calls).toHaveLength(1);
    fireEvent.click(main().getByRole('button', { name: 'Buscar' }));
    await waitFor(() => { expect(view.calls).toHaveLength(2); });
    expect([...view.calls[1]?.url.searchParams.keys() ?? []]).toEqual(['limit', query]);
    expect(view.calls[1]?.url.searchParams.get(query)).toBe(value);
    await waitFor(() => { expect(main().getByRole('button', { name: 'Buscar' }).hasAttribute('disabled')).toBe(false); });
    fireEvent.click(main().getByRole('button', { name: 'Limpiar búsqueda' }));
    await waitFor(() => { expect(view.calls).toHaveLength(3); });
    expect([...view.calls[2]?.url.searchParams.keys() ?? []]).toEqual(['limit']);
  });
  it('cursor, conservar primera página y cargar más sin números de página', async () => {
    const view = renderReception('/clientes', call => jsonResponse({ customers: [call.url.searchParams.has('cursor') ? { ...CUSTOMER, customerId: IDS.other, firstName: 'Bruno' } : CUSTOMER], nextCursor: call.url.searchParams.has('cursor') ? null : 'opaque_cursor' }), PERMISSIONS);
    fireEvent.click(await main().findByRole('button', { name: 'Cargar más' }));
    expect(await main().findByRole('link', { name: 'Bruno Prueba' })).toBeDefined();
    expect(main().getByRole('link', { name: 'Ana Prueba' })).toBeDefined();
    expect(view.calls[1]?.url.searchParams.get('cursor')).toBe('opaque_cursor');
    expect(main().queryByRole('button', { name: 'Cargar más' })).toBeNull();
  });
  it('vacío inicial y vacío con filtro', async () => {
    renderReception('/clientes', () => jsonResponse({ customers: [], nextCursor: null }), PERMISSIONS);
    expect(await main().findByText('Todavía no hay clientes')).toBeDefined();
    change('Nombre del cliente', 'Nadie');
    fireEvent.click(main().getByRole('button', { name: 'Buscar' }));
    expect(await main().findByText('No encontramos clientes')).toBeDefined();
  });
  it('error + reintentar conserva filtro y referencia segura', async () => {
    let attempts = 0;
    renderReception('/clientes', () => ++attempts === 1 ? errorResponse('INTERNAL_ERROR', 500) : jsonResponse({ customers: [CUSTOMER], nextCursor: null }), PERMISSIONS);
    fireEvent.click(await main().findByRole('button', { name: 'Reintentar' }));
    expect(await main().findByRole('link', { name: 'Ana Prueba' })).toBeDefined();
    expect(screen.queryByText('PRIVATE BACKEND COPY MUST NEVER APPEAR')).toBeNull();
  });
  it('crear cliente sin ID manual, guardar una vez y navegar al detalle', async () => {
    const view = renderReception('/clientes/nuevo', call => call.init.method === 'POST' ? jsonResponse({ customer: CUSTOMER }, 201) : response(call), PERMISSIONS);
    change('Nombre *', 'Ana'); change('Apellido *', 'Prueba'); change('Teléfono *', '+5700000000');
    expect(main().queryByLabelText(/customerId|ID del cliente/)).toBeNull();
    const submit = main().getByRole('button', { name: 'Guardar' }); fireEvent.click(submit); fireEvent.click(submit);
    expect(await main().findByRole('heading', { name: 'Ana Prueba', level: 1 })).toBeDefined();
    const posts = view.calls.filter(c => c.init.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(readBody(posts[0]?.init.body)).toEqual({ firstName: 'Ana', lastName: 'Prueba', phone: '+5700000000', email: null, documentType: null, documentNumber: null, notes: null });
  });
  it('validación local asociada al documento y campos requeridos', () => {
    const view = renderReception('/clientes/nuevo', response, PERMISSIONS);
    change('Tipo de documento', 'CC'); save();
    expect(main().getByLabelText('Número de documento').getAttribute('aria-invalid')).toBe('true');
    expect(main().getByLabelText('Nombre *').getAttribute('aria-describedby')).toBe('error-firstName');
    expect(view.calls).toHaveLength(0);
  });
  it('update solo campos modificados, null para limpiar y OCC exacto', async () => {
    const view = renderReception(`/clientes/${IDS.customer}/editar`, call => call.init.method === 'PATCH' ? jsonResponse({ customer: { ...CUSTOMER, notes: 'Nueva nota' } }) : response(call), PERMISSIONS);
    await main().findByDisplayValue('Ana'); change('Notas', 'Nueva nota'); save();
    await main().findByRole('heading', { name: 'Ana Prueba', level: 1 });
    const patch = view.calls.find(c => c.init.method === 'PATCH');
    expect(readBody(patch?.init.body)).toEqual({ expectedUpdatedAt: TIME, notes: 'Nueva nota' });
  });
  it('OCC conserva edición, adopta campos no editados y exige revisión', async () => {
    let reads = 0; let patches = 0;
    const latest = { ...CUSTOMER, phone: '+5711111111', firstName: 'Remoto', updatedAt: '2026-10-02T15:04:05.987654Z' };
    const view = renderReception(`/clientes/${IDS.customer}/editar`, call => {
      if (call.init.method === 'PATCH') return ++patches === 1 ? errorResponse('RESOURCE_VERSION_CONFLICT') : jsonResponse({ customer: { ...latest, firstName: 'Local' } });
      return jsonResponse({ customer: ++reads === 1 ? CUSTOMER : latest });
    }, PERMISSIONS);
    await main().findByDisplayValue('Ana'); change('Nombre *', 'Local'); save();
    await main().findByRole('button', { name: 'He revisado la versión actual' });
    expect(main().getByDisplayValue('Local')).toBeDefined();
    expect(main().getByDisplayValue('+5711111111')).toBeDefined();
    expect(main().getByRole('button', { name: 'Guardar' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(main().getByRole('button', { name: 'He revisado la versión actual' })); save();
    await waitFor(() => { expect(patches).toBe(2); });
    expect(readBody(view.calls.filter(c => c.init.method === 'PATCH')[1]?.init.body)).toEqual({ expectedUpdatedAt: latest.updatedAt, firstName: 'Local' });
  });
});
describe('Vehículos CRM', () => {
  it('lista tenant, búsqueda únicamente por placa y limpiar', async () => {
    const view = renderReception('/vehiculos', response, PERMISSIONS);
    await main().findByRole('link', { name: 'ABC123' });
    change('Buscar por placa', 'abc-123'); fireEvent.click(main().getByRole('button', { name: 'Buscar' }));
    await waitFor(() => { expect(view.calls).toHaveLength(2); });
    expect(view.calls[1]?.url.searchParams.get('plate')).toBe('abc-123');
    expect([...view.calls[1]?.url.searchParams.keys() ?? []]).toEqual(['limit', 'plate']);
    await waitFor(() => { expect(main().getByRole('button', { name: 'Buscar' }).hasAttribute('disabled')).toBe(false); });
    fireEvent.click(main().getByRole('button', { name: 'Limpiar búsqueda' }));
    await waitFor(() => { expect(view.calls).toHaveLength(3); });
    expect(view.calls[2]?.url.searchParams.has('plate')).toBe(false);
  });
  it.each(['assigned', 'quality_control'])('lista denegada con scope %s sin fetch ni links', async scope => {
    const view = renderReception('/vehiculos', response, [{ code: 'vehicles.read', scopes: [scope] }]);
    expect(await main().findByRole('alert')).toBeDefined();
    expect(view.calls).toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'Vehículos' })).toBeNull();
  });
  it('cursor de vehículos', async () => {
    const view = renderReception('/vehiculos', call => jsonResponse({ vehicles: [call.url.searchParams.has('cursor') ? { ...VEHICLE, vehicleId: IDS.other, plate: 'XYZ999' } : VEHICLE], nextCursor: call.url.searchParams.has('cursor') ? null : 'next_vehicle' }), PERMISSIONS);
    fireEvent.click(await main().findByRole('button', { name: 'Cargar más' }));
    expect(await main().findByRole('link', { name: 'XYZ999' })).toBeDefined();
    expect(view.calls[1]?.url.searchParams.get('cursor')).toBe('next_vehicle');
  });
  it('detalle completo y propietarios actuales y anteriores', async () => {
    renderReception(`/vehiculos/${IDS.vehicle}`, call => call.url.pathname.endsWith('/owners') ? jsonResponse({ owners: [OWNER, { ...OWNER, ownershipId: IDS.customer, customer: { firstName: 'Bruno', lastName: 'Anterior' }, validTo: TIME }] }) : response(call), PERMISSIONS);
    expect(await main().findByText('VIN')).toBeDefined();
    expect(await main().findByRole('link', { name: 'Ana Prueba' })).toBeDefined();
    expect(main().getByText('Historial de propietarios')).toBeDefined();
    expect(main().getByRole('link', { name: 'Bruno Anterior' })).toBeDefined();
    expect(main().getByRole('link', { name: 'Editar vehículo' })).toBeDefined();
  });
  it('assigned acepta DTO reducido sin VIN, motor, kilometraje, timestamps, propietarios ni editar', async () => {
    const view = renderReception(`/vehiculos/${IDS.vehicle}`, () => jsonResponse({ vehicle: TECH }), [{ code: 'vehicles.read', scopes: ['assigned'] }, { code: 'vehicles.update', scopes: ['assigned'] }]);
    await main().findByRole('heading', { name: 'ABC123', level: 1 });
    expect(main().queryByText('VIN')).toBeNull(); expect(main().queryByText('Número de motor')).toBeNull(); expect(main().queryByText('Kilometraje actual')).toBeNull();
    expect(main().queryByRole('link', { name: 'Editar vehículo' })).toBeNull();
    expect(view.calls).toHaveLength(1);
  });
  it('quality_control no concede acceso assigned al detalle', async () => {
    const view = renderReception(`/vehiculos/${IDS.vehicle}`, response, [{ code: 'vehicles.read', scopes: ['quality_control'] }]);
    expect(await main().findByRole('alert')).toBeDefined(); expect(view.calls).toHaveLength(0);
  });
  it('sin customers.read tenant no solicita owners', async () => {
    const view = renderReception(`/vehiculos/${IDS.vehicle}`, response, [{ code: 'vehicles.read', scopes: ['tenant'] }, { code: 'customers.read', scopes: ['assigned'] }]);
    await main().findByText('VIN'); expect(view.calls).toHaveLength(1);
    expect(main().queryByText('Propietario actual')).toBeNull();
  });
  it('un 403 de owners no invalida el detalle', async () => {
    renderReception(`/vehiculos/${IDS.vehicle}`, call => call.url.pathname.endsWith('/owners') ? errorResponse('PERMISSION_DENIED', 403) : response(call), PERMISSIONS);
    await main().findByRole('button', { name: 'Reintentar propietarios' });
    expect(main().getByText('VIN')).toBeDefined();
    expect(main().getByRole('heading', { name: 'ABC123', level: 1 })).toBeDefined();
  });
  it.each(['vehicles.create', 'vehicle_owners.manage', 'customers.read'])('nuevo vehículo requiere %s tenant', async missing => {
    const permissions = PERMISSIONS.map(p => p.code === missing ? { ...p, scopes: ['assigned'] } : p);
    const view = renderReception('/vehiculos/nuevo', response, permissions);
    expect(await main().findByRole('alert')).toBeDefined(); expect(view.calls).toHaveLength(0);
    expect(main().queryByRole('button', { name: 'Guardar' })).toBeNull();
  });
  it('creación con selector CRM y un solo POST sin ownership adicional', async () => {
    const view = renderReception('/vehiculos/nuevo', call => call.init.method === 'POST' ? jsonResponse({ vehicle: VEHICLE, ownership: {} }, 201) : response(call), PERMISSIONS);
    fireEvent.click(await main().findByRole('button', { name: 'Seleccionar Ana Prueba' }));
    change('Placa *', 'ABC123'); change('Marca *', 'Marca de prueba'); change('Modelo *', 'Modelo de prueba');
    expect(main().queryByLabelText(/customerId|ID del cliente|vehicleId/)).toBeNull();
    save();
    expect(await main().findByRole('heading', { name: 'ABC123', level: 1 })).toBeDefined();
    const posts = view.calls.filter(c => c.init.method === 'POST');
    expect(posts).toHaveLength(1); expect(posts[0]?.url.pathname).toBe('/api/v1/vehicles');
    expect(readBody(posts[0]?.init.body)).toEqual({ customerId: IDS.customer, plate: 'ABC123', vehicleType: 'car', brand: 'Marca de prueba', model: 'Modelo de prueba', modelYear: null, color: null, vin: null, engineNumber: null });
  });
  it.each([['VEHICLE_PLATE_ALREADY_EXISTS', 409], ['VEHICLE_OWNERSHIP_CONFLICT', 409], ['CUSTOMER_NOT_FOUND', 404]] as const)('crear maneja %s conservando formulario', async (code, status) => {
    const view = renderReception('/vehiculos/nuevo', call => call.init.method === 'POST' ? errorResponse(code, status) : response(call), PERMISSIONS);
    fireEvent.click(await main().findByRole('button', { name: 'Seleccionar Ana Prueba' }));
    change('Placa *', 'ABC123'); change('Marca *', 'Marca'); change('Modelo *', 'Modelo'); save();
    await main().findByRole('alert');
    expect(main().getByDisplayValue('ABC123')).toBeDefined(); expect(main().getByText('request-test')).toBeDefined();
    expect(view.calls.filter(c => c.init.method === 'POST')).toHaveLength(1);
  });
  it('update OCC conserva valores y envía token remoto exacto al confirmar', async () => {
    let reads = 0; let patches = 0;
    const latest = { ...VEHICLE, color: 'Azul remoto', updatedAt: '2026-10-02T15:04:05.000001Z' };
    const view = renderReception(`/vehiculos/${IDS.vehicle}/editar`, call => {
      if (call.init.method === 'PATCH') return ++patches === 1 ? errorResponse('RESOURCE_VERSION_CONFLICT') : jsonResponse({ vehicle: { ...latest, brand: 'Nueva marca' } });
      return jsonResponse({ vehicle: ++reads === 1 ? VEHICLE : latest });
    }, PERMISSIONS);
    await main().findByDisplayValue('ABC123'); change('Marca *', 'Nueva marca'); save();
    fireEvent.click(await main().findByRole('button', { name: 'He revisado la versión actual' }));
    expect(main().getByDisplayValue('Azul remoto')).toBeDefined(); expect(main().getByDisplayValue('Nueva marca')).toBeDefined(); save();
    await waitFor(() => { expect(patches).toBe(2); });
    expect(readBody(view.calls.filter(c => c.init.method === 'PATCH')[1]?.init.body)).toEqual({ expectedUpdatedAt: latest.updatedAt, brand: 'Nueva marca' });
  });
});
describe('CRM aislamiento y errores', () => {
  it.each(['/clientes', '/vehiculos'])('cambio de tenant aborta %s y respuesta tardía no contamina', async route => {
    let resolve: ((value: ReturnType<typeof jsonResponse>) => void) | undefined;
    const oldResponse = new Promise<ReturnType<typeof jsonResponse>>(done => { resolve = done; });
    const key = route === '/clientes' ? 'customers' : 'vehicles';
    const view = renderReception(route, call => new Headers(call.init.headers).get('X-Tenant-Id') === IDS.tenant ? oldResponse : jsonResponse({ [key]: [], nextCursor: null }), PERMISSIONS, true);
    await waitFor(() => { expect(view.calls.length).toBeGreaterThan(0); });
    view.updateRuntime({ ...view.runtime, tenantId: IDS.other });
    expect(await main().findByText(route === '/clientes' ? 'Todavía no hay clientes' : 'Todavía no hay vehículos')).toBeDefined();
    resolve?.(jsonResponse({ [key]: route === '/clientes' ? [CUSTOMER] : [VEHICLE], nextCursor: null }));
    await waitFor(() => { expect(main().queryByRole('link', { name: route === '/clientes' ? 'Ana Prueba' : 'ABC123' })).toBeNull(); });
    expect(view.calls[0]?.init.signal?.aborted).toBe(true);
  });
  it('al cambiar sesión se descarta selección y campos CRM', async () => {
    const view = renderReception('/vehiculos/nuevo', response, PERMISSIONS);
    fireEvent.click(await main().findByRole('button', { name: 'Seleccionar Ana Prueba' }));
    change('Placa *', 'LOCAL999');
    view.updateRuntime({ ...view.runtime, identity: 'different-user:session' });
    await main().findByRole('button', { name: 'Seleccionar Ana Prueba' });
    expect(main().getByLabelText('Placa *').getAttribute('value')).toBe('');
    expect(main().queryByRole('button', { name: 'Cambiar cliente' })).toBeNull();
  });
  it.each([['REQUEST_VALIDATION_FAILED', 400], ['AUTHENTICATION_REQUIRED', 401], ['PERMISSION_DENIED', 403], ['CUSTOMER_NOT_FOUND', 404], ['RATE_LIMIT_EXCEEDED', 429], ['INTERNAL_ERROR', 500]] as const)('error %s no borra campos ni reintenta POST', async (code, status) => {
    const view = renderReception('/clientes/nuevo', () => errorResponse(code, status, status === 429 ? '10' : null), PERMISSIONS);
    change('Nombre *', 'Ana'); change('Apellido *', 'Prueba'); change('Teléfono *', '+5700000000'); save();
    await main().findByRole('alert'); expect(main().getByDisplayValue('Ana')).toBeDefined();
    expect(view.calls).toHaveLength(1); expect(view.tokenCalls).toHaveLength(1);
    expect(main().getByText('request-test')).toBeDefined(); expect(screen.queryByText('PRIVATE BACKEND COPY MUST NEVER APPEAR')).toBeNull();
  });
  it('Dashboard enlaza a clientes y vehículos con permisos tenant', async () => {
    renderReception('/panel', response, PERMISSIONS);
    const actions = await main().findByRole('region', { name: 'Accesos rápidos' });
    fireEvent.click(within(actions).getByRole('link', { name: 'Clientes' }));
    await main().findByRole('link', { name: 'Ana Prueba' });
    fireEvent.click(screen.getByRole('link', { name: 'Vehículos' }));
    expect(await main().findByRole('link', { name: 'ABC123' })).toBeDefined();
  });
  it('Dashboard oculta CRM con grants assigned/quality_control', async () => {
    renderReception('/panel', response, [{ code: 'dashboard.operational.read', scopes: ['tenant'] }, { code: 'customers.read', scopes: ['quality_control'] }, { code: 'vehicles.read', scopes: ['assigned'] }]);
    await main().findByText('Datos de demostración');
    await waitFor(() => { expect(main().queryByText('Cargando el resumen del taller…')).toBeNull(); });
    expect(main().queryByRole('link', { name: 'Clientes' })).toBeNull(); expect(main().queryByRole('link', { name: 'Vehículos' })).toBeNull();
  });
});

function readBody(body: unknown): unknown { if (typeof body !== 'string') throw new Error('Expected JSON body'); return JSON.parse(body) as unknown; }

describe('CRM recuperación y estados complementarios', () => {
  it.each(['/vehiculos', '/clientes'])('CTA crear oculto cuando create solo tiene scope assigned: %s', async route => {
    const permissions = PERMISSIONS.map(p => p.code.endsWith('.create') ? { ...p, scopes: ['assigned'] } : p);
    renderReception(route, response, permissions);
    await main().findByRole('link', { name: route === '/vehiculos' ? 'ABC123' : 'Ana Prueba' });
    expect(main().queryByRole('link', { name: route === '/vehiculos' ? '+ Nuevo vehículo' : '+ Nuevo cliente' })).toBeNull();
  });
  it('vehículos vacío inicial, filtrado vacío y retry', async () => {
    let attempts = 0;
    renderReception('/vehiculos', () => ++attempts === 1 ? errorResponse('INTERNAL_ERROR', 500) : jsonResponse({ vehicles: [], nextCursor: null }), PERMISSIONS);
    fireEvent.click(await main().findByRole('button', { name: 'Reintentar' }));
    await main().findByText('Todavía no hay vehículos');
    change('Buscar por placa', 'NAD123'); fireEvent.click(main().getByRole('button', { name: 'Buscar' }));
    expect(await main().findByText('No encontramos vehículos')).toBeDefined();
  });
  it.each([['VEHICLE_PLATE_ALREADY_EXISTS', 409], ['VEHICLE_NOT_FOUND', 404]] as const)('update vehículo maneja %s sin perder edición', async (code, status) => {
    const view = renderReception(`/vehiculos/${IDS.vehicle}/editar`, call => call.init.method === 'PATCH' ? errorResponse(code, status) : response(call), PERMISSIONS);
    await main().findByDisplayValue('ABC123'); change('Placa *', 'XYZ999'); save();
    await main().findByRole('alert');
    expect(main().getByDisplayValue('XYZ999')).toBeDefined();
    expect(view.calls.filter(c => c.init.method === 'PATCH')).toHaveLength(1);
  });
  it('OCC no permite guardar si falla recuperación; retry y revisión mantienen edición', async () => {
    let reads = 0; let patches = 0;
    const latest = { ...CUSTOMER, updatedAt: '2026-10-02T16:00:00.000123Z', notes: 'Nota remota' };
    const view = renderReception(`/clientes/${IDS.customer}/editar`, call => {
      if (call.init.method === 'PATCH') return ++patches === 1 ? errorResponse('RESOURCE_VERSION_CONFLICT') : jsonResponse({ customer: { ...latest, phone: '+5722222222' } });
      reads++;
      return reads === 2 ? errorResponse('INTERNAL_ERROR', 500) : jsonResponse({ customer: reads === 1 ? CUSTOMER : latest });
    }, PERMISSIONS);
    await main().findByDisplayValue('Ana'); change('Teléfono *', '+5722222222'); save();
    fireEvent.click(await main().findByRole('button', { name: 'Volver a consultar versión actual' }));
    fireEvent.click(await main().findByRole('button', { name: 'He revisado la versión actual' }));
    expect(main().getByDisplayValue('+5722222222')).toBeDefined(); expect(main().getByDisplayValue('Nota remota')).toBeDefined(); save();
    await waitFor(() => { expect(patches).toBe(2); });
    expect(readBody(view.calls.filter(c => c.init.method === 'PATCH')[1]?.init.body)).toEqual({ expectedUpdatedAt: latest.updatedAt, phone: '+5722222222' });
  });
  it('limpiar email y par documento envía null y omite campos no modificados', async () => {
    const original = { ...CUSTOMER, email: 'prueba@example.test', documentType: 'CC', documentNumber: '12345' };
    const view = renderReception(`/clientes/${IDS.customer}/editar`, call => jsonResponse({ customer: call.init.method === 'PATCH' ? CUSTOMER : original }), PERMISSIONS);
    await main().findByDisplayValue('prueba@example.test');
    change('Email', ''); change('Tipo de documento', ''); change('Número de documento', ''); save();
    await waitFor(() => { expect(view.calls.some(c => c.init.method === 'PATCH')).toBe(true); });
    expect(readBody(view.calls.find(c => c.init.method === 'PATCH')?.init.body)).toEqual({ expectedUpdatedAt: TIME, email: null, documentType: null, documentNumber: null });
  });
  it('cancelar creación regresa a lista y edición regresa al detalle', async () => {
    const view = renderReception('/clientes/nuevo', response, PERMISSIONS);
    fireEvent.click(main().getByRole('link', { name: 'Cancelar' }));
    fireEvent.click(await main().findByRole('link', { name: 'Ana Prueba' }));
    fireEvent.click(await main().findByRole('link', { name: 'Editar cliente' }));
    await main().findByDisplayValue('Ana'); change('Nombre *', 'Sin guardar');
    fireEvent.click(main().getByRole('link', { name: 'Cancelar' }));
    expect(await main().findByRole('heading', { name: 'Ana Prueba', level: 1 })).toBeDefined();
    expect(view.calls.every(c => c.init.method === 'GET')).toBe(true);
  });
  it('un error de red en POST conserva datos y no reintenta', async () => {
    const view = renderReception('/clientes/nuevo', () => { throw new Error('Synthetic transport error'); }, PERMISSIONS);
    change('Nombre *', 'Ana'); change('Apellido *', 'Prueba'); change('Teléfono *', '+5700000000'); save();
    await main().findByText(/No hay conexión con el servicio/);
    expect(main().getByDisplayValue('Ana')).toBeDefined(); expect(view.calls).toHaveLength(1);
  });
  it('429 de lectura no lanza fetch automático ni permite retry inmediato', async () => {
    const view = renderReception('/clientes', () => errorResponse('RATE_LIMIT_EXCEEDED', 429, '30'), PERMISSIONS);
    const button = await main().findByRole('button', { name: 'Reintentar' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(view.calls).toHaveLength(1);
  });
});
