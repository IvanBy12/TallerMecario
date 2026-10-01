import type { IntakeForm } from './reception-create-form';
export function ReceptionFields({ form, onChange, disabled = false }: {
    readonly form: IntakeForm;
    readonly onChange: (form: IntakeForm) => void;
    readonly disabled?: boolean;
}) {
    const change = (key: keyof IntakeForm, value: string) => { onChange({ ...form, [key]: value }); };
    return <fieldset disabled={disabled} className="reception-fields"><legend>Datos de ingreso</legend>
    <label>Kilometraje (km)<input required type="number" min="0" max="2147483647" step="1" value={form.mileageKm} onChange={(e) => { change('mileageKm', e.target.value); }}/></label>
    <label>Combustible (%)<input type="number" min="0" max="100" step="1" value={form.fuelLevelPct} onChange={(e) => { change('fuelLevelPct', e.target.value); }}/></label>
    <label>Observaciones del cliente<textarea value={form.customerNotes} onChange={(e) => { change('customerNotes', e.target.value); }}/></label>
    <label>Notas internas del asesor<textarea value={form.advisorNotes} onChange={(e) => { change('advisorNotes', e.target.value); }}/></label>
  </fieldset>;
}
