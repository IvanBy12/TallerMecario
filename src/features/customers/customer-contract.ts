import { array, envelope, id, nonempty, nullable, object, text, timestamp } from '@/shared/crm/contract';
export const customerParser = object({ customerId: id, firstName: nonempty, lastName: nonempty, phone: nonempty, email: nullable(text), documentType: nullable(text), documentNumber: nullable(text), notes: nullable(text), createdAt: timestamp, updatedAt: timestamp });
export type Customer = NonNullable<ReturnType<typeof customerParser>>;
export const parseCustomer = envelope('customer', customerParser);
export const parseCustomers = object({ customers: array(customerParser), nextCursor: nullable(nonempty) });
