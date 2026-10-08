// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { uploadTaskCopy } from './upload-task-copy';
import { CONFIRMED_MEDIA } from '@/test/media-fixtures';
import type { UploadTaskState } from './upload-task-types';

describe('safe stable upload copy', () => {
  it.each<UploadTaskState>([
    { phase: 'idle' }, { phase: 'disposed' },
    { phase: 'preparing', progress: { determinate: false } },
    { phase: 'uploading', progress: { determinate: true, loadedBytes: 2, totalBytes: 3, ratio: 2 / 3 } },
    { phase: 'completing', progress: { determinate: false } },
    { phase: 'succeeded', media: CONFIRMED_MEDIA },
    { phase: 'canceled', recovery: { kind: 'safe_local_restart' } },
    { phase: 'canceled', recovery: { kind: 'contract_dependency', reason: 'reconciliation' } },
    { phase: 'ambiguous', failure: { source: 'storage', kind: 'network', status: null }, recovery: { kind: 'contract_dependency', reason: 'reconciliation' } },
    { phase: 'needs_restart', failure: { source: 'storage', kind: 'upload_conflict', status: 412 }, recovery: { kind: 'contract_dependency', reason: 'reconciliation' } },
    { phase: 'needs_restart', failure: { source: 'storage', kind: 'signed_url_rejected', status: 403 }, recovery: { kind: 'contract_dependency', reason: 'new_session' } },
    ...(['payload_too_large', 'unsupported_media_type', 'unprocessable_upload'] as const).map(kind => ({ phase: 'failed' as const, failure: { source: 'storage' as const, kind, status: 413 }, recovery: { kind: 'user_action' as const } })),
    ...(['no_session', 'unauthenticated', 'tenant_access_denied', 'permission_denied', 'rate_limited', 'server_error'] as const).map(kind => ({ phase: 'failed' as const, failure: { source: 'api' as const, stage: 'create' as const, kind, status: null }, recovery: { kind: 'contract_dependency' as const, reason: 'create_retry' as const } })),
  ])('phase/recovery copy is static and provider-neutral %#', state => {
    const copy = uploadTaskCopy(state);
    expect(copy ?? '').not.toMatch(/https:|objectKey|requestId|R2|\d+%/);
    if (state.phase === 'ambiguous') {
      expect(copy).toContain('No se pudo confirmar'); expect(copy).not.toContain('Upload failed');
    }
    if (state.phase === 'canceled') expect(copy).toContain('cancelada');
  });
  it('412 copy describes neutral review without asserting a cause or new session', () => {
    expect(uploadTaskCopy({ phase: 'needs_restart', failure: { source: 'storage', kind: 'upload_conflict', status: 412 },
      recovery: { kind: 'contract_dependency', reason: 'reconciliation' } }))
      .toBe('La carga requiere revisión antes de volver a intentarlo.');
  });
  it('byte events do not change status copy', () => {
    const before: UploadTaskState = { phase: 'uploading', progress: { determinate: false } };
    expect(uploadTaskCopy(before)).toBe(uploadTaskCopy({ phase: 'uploading', progress: { determinate: true, loadedBytes: 3, totalBytes: 3, ratio: 1 } }));
  });
});
