import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ApiResult, JsonObject } from '@/shared/api/http-client';
import { PageHeader } from '@/shared/ui/page-header';
import { CrmFailure, Forbidden } from './copy';
import { CrmFields, formBody, modifiedBody, valuesOf, type FieldErrors, type FieldSpec, type FormValues } from './form';
import { useCrmAction } from './use-action';
export interface EditableRecord { readonly updatedAt: string }
export function CrmEditor<T extends EditableRecord>({ title, fields, allowed, signal, load, save, validate, cancelTo, detailTo, selection, selectionReady = true, createExtra = {} }: {
  readonly title: string; readonly fields: readonly FieldSpec[]; readonly allowed: boolean; readonly signal: AbortSignal;
  readonly load?: () => Promise<ApiResult<T>>; readonly save: (body: JsonObject) => Promise<ApiResult<T>>;
  readonly validate: (values: FormValues) => FieldErrors; readonly cancelTo: string; readonly detailTo: (data: T) => string;
  readonly selection?: ReactNode; readonly selectionReady?: boolean; readonly createExtra?: JsonObject;
}) {
  const [values, setValues] = useState<FormValues>(() => valuesOf(fields));
  const [baseline, setBaseline] = useState<T | null>(null);
  const [edited, setEdited] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [current, setCurrent] = useState<FormValues | null>(null);
  const editedRef = useRef(edited); editedRef.current = edited;
  const action = useCrmAction(signal);
  const recovery = useCrmAction(signal);
  const { run } = action;
  const navigate = useNavigate();
  const initialLoad = useCallback(() => {
    if (load === undefined || !allowed) return;
    return run(load, data => { setBaseline(data); setValues(valuesOf(fields, data)); });
  }, [load, allowed, fields, run]);
  useEffect(() => { void initialLoad(); }, [initialLoad]);
  const refresh = async () => {
    if (load === undefined) return;
    await recovery.run(load, latest => {
      setBaseline(latest);
      const serverValues = valuesOf(fields, latest);
      setCurrent(serverValues);
      setValues(old => Object.fromEntries(fields.map(f => [f.key, editedRef.current.has(f.key) ? old[f.key] ?? '' : serverValues[f.key] ?? ''])));
      setRecovered(true);
    });
  };
  const submit = () => {
    if (!allowed || action.blocked || recovery.blocked || conflict || (load !== undefined && baseline === null)) return;
    const nextErrors = validate(values); setErrors(nextErrors); setNotice(null);
    if (Object.keys(nextErrors).length) { document.getElementById(`crm-${Object.keys(nextErrors)[0] ?? ''}`)?.focus(); return; }
    if (!selectionReady) { setNotice('Selecciona un cliente propietario antes de guardar.'); return; }
    const body = formBody(fields, values);
    const payload = baseline === null ? { ...body, ...createExtra } : modifiedBody(body, formBody(fields, valuesOf(fields, baseline)), edited, baseline.updatedAt);
    if (baseline !== null && Object.keys(payload).length === 1) { setNotice('No hay cambios para guardar.'); return; }
    void run(() => save(payload), data => { void navigate(detailTo(data)); }, async failure => {
      if (failure.code === 'RESOURCE_VERSION_CONFLICT') { setConflict(true); setRecovered(false); await refresh(); }
    });
  };
  const busy = action.busy || recovery.busy;
  return <section className="crm-page"><PageHeader title={title} description="Los campos marcados con * son obligatorios." /><Link className="crm-back" to={cancelTo}>Volver</Link>
    {!allowed ? <Forbidden /> : <>
      {busy && <p role="status">{baseline === null && load !== undefined ? 'Cargando registro…' : 'Procesando…'}</p>}
      <CrmFailure failure={action.failure} /><CrmFailure failure={recovery.failure} />
      {baseline === null && load !== undefined && action.failure !== null && <button className="ui-button" type="button" disabled={action.blocked} onClick={() => { void initialLoad(); }}>Reintentar</button>}
      {(load === undefined || baseline !== null) && <form className="crm-form" noValidate onSubmit={e => { e.preventDefault(); submit(); }}>
        {selection === undefined ? null : <fieldset className="crm-selection-wrap" disabled={busy}>{selection}</fieldset>}
        <CrmFields fields={fields} values={values} errors={errors} disabled={busy} onChange={(key, value) => { setValues(old => ({ ...old, [key]: value })); setEdited(old => new Set([...old, key])); }} />
        {notice !== null && <p role="alert">{notice}</p>}
        {conflict && <section className="crm-conflict" aria-label="Revisión de cambios"><h2>Revisa los cambios del registro</h2><p>Tus campos editados siguen en el formulario. Los demás se actualizarán con la versión actual.</p>
          {recovered && current !== null ? <><dl className="crm-data">{fields.filter(f => edited.has(f.key)).map(f => <div key={f.key}><dt>{f.label} actual</dt><dd>{current[f.key] || 'Sin información'}</dd></div>)}</dl><button type="button" className="ui-button" disabled={busy} onClick={() => { setConflict(false); }}>He revisado la versión actual</button></> : <button type="button" className="ui-button" disabled={recovery.blocked} onClick={() => { void refresh(); }}>Volver a consultar versión actual</button>}
        </section>}
        <div className="crm-form-actions"><button className="ui-button crm-primary" type="submit" disabled={action.blocked || recovery.blocked || conflict}>{busy ? 'Guardando…' : 'Guardar'}</button>{busy ? <span>Espera para cancelar.</span> : <Link className="ui-button" to={cancelTo}>Cancelar</Link>}</div>
      </form>}
    </>}
  </section>;
}
