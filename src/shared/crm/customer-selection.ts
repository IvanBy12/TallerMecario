import type { ApiResult } from '@/shared/api/http-client';
export interface CustomerSelection { readonly customerId: string; readonly firstName: string; readonly lastName: string; readonly phone: string }
export type CustomerSearchFilter = 'name' | 'phone' | 'documentNumber';
export interface CustomerSearch { readonly field: CustomerSearchFilter; readonly value: string }
export type SearchCustomers = (search: CustomerSearch, cursor?: string) => Promise<ApiResult<{ readonly customers: readonly CustomerSelection[]; readonly nextCursor: string | null }>>;
