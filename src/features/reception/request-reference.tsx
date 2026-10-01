import type { ApiFailure } from '@/shared/api/api-failure';
import { receptionCopy } from './reception-copy';
export function RequestReference({ failure }: {
    readonly failure: ApiFailure | null;
}) {
    return failure === null ? null : <div role="alert"><p>{receptionCopy(failure)}</p>{failure.requestId !== null && <p>Referencia de solicitud: <code>{failure.requestId}</code></p>}</div>;
}
