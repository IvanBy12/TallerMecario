import type { ApiFailure } from '@/shared/api/api-failure';
import { receptionCopy } from './reception-copy';
export function RequestReference({ failure, closing = false }: {
    readonly failure: ApiFailure | null;
    readonly closing?: boolean;
}) {
    return failure === null ? null : <div role="alert"><p>{receptionCopy(failure, closing)}</p>{failure.requestId !== null && <p>Referencia de solicitud: <code>{failure.requestId}</code></p>}</div>;
}
