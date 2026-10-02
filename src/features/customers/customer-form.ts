import { requiredErrors, type FieldSpec, type FormValues } from '@/shared/crm/form';
export const CUSTOMER_FIELDS: readonly FieldSpec[] = [
  { key: 'firstName', label: 'Nombre', required: true }, { key: 'lastName', label: 'Apellido', required: true },
  { key: 'phone', label: 'Teléfono', type: 'tel', required: true }, { key: 'email', label: 'Email', type: 'email' },
  { key: 'documentType', label: 'Tipo de documento' }, { key: 'documentNumber', label: 'Número de documento' },
  { key: 'notes', label: 'Notas', type: 'textarea' },
];
export function customerErrors(values: FormValues) {
  const errors = requiredErrors(CUSTOMER_FIELDS, values);
  if (Boolean(values['documentType']?.trim()) !== Boolean(values['documentNumber']?.trim())) {
    errors['documentType'] = 'Completa ambos datos del documento o deja ambos vacíos.';
    errors['documentNumber'] = errors['documentType'];
  }
  if (values['phone']?.trim() && !/^\+?[0-9]{7,15}$/.test(values['phone'].replace(/[\s.()-]/g, ''))) errors['phone'] = 'Ingresa un teléfono de 7 a 15 dígitos; puedes incluir el indicativo.';
  if (values['email']?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values['email'].trim())) errors['email'] = 'Ingresa un email válido.';
  if (Array.from(values['notes']?.trim() ?? '').length > 2000) errors['notes'] = 'Las notas admiten hasta 2000 caracteres.';
  return errors;
}
