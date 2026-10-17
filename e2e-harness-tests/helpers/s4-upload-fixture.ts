import { S4MediaEvidence, type S4Exchange } from '../../e2e/support/s4-media-evidence';
const marker = 'SYNTHETIC_TOKEN_OR_HOSTILE_BODY_NOT_FOR_REPORTS';
const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
export const API = 'https://api.example.invalid', R2 = 'https://synthetic.r2.cloudflarestorage.com', FRONTEND = 'http://localhost:5173';
export const reception = id(10);
export const files = [{ mediaType: 'photo', sizeBytes: 20 }, { mediaType: 'video360', sizeBytes: 40 }] as const;
export function exchange(method: string, url: string, requestBody: unknown, responseBody: unknown, status = 200, requestSeq?: number): S4Exchange {
  return { method, url, requestBody, responseBody, status, requestSeq,
    requestHeaders: { 'content-type': 'image/png', 'if-none-match': '*', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type,if-none-match' },
    responseHeaders: { 'cache-control': 'no-store', 'access-control-allow-origin': FRONTEND, 'access-control-allow-methods': 'PUT,GET', 'access-control-allow-headers': 'content-type,if-none-match' } };
}
export function create(evidence: S4MediaEvidence, n: number, mediaType: 'photo' | 'video360', target = reception) {
  const body = { mediaType, mimeType: mediaType === 'photo' ? 'image/png' : 'video/mp4', expectedSizeBytes: mediaType === 'photo' ? 20 : 40, retentionClass: 'operational', operationalContext: { type: 'reception', receptionId: target } };
  const session = id(n), asset = id(n + 100), url = `${R2}/object/${String(n)}?X-Amz-Signature=${marker}-${String(n)}`;
  const seq = evidence.noteRequest('POST', `${API}/api/v1/media/upload-sessions`, body);
  evidence.observe(exchange('POST', `${API}/api/v1/media/upload-sessions`, body, { uploadSessionId: session, mediaAssetId: asset, uploadMethod: 'PUT', uploadUrl: url,
    status: 'pending', objectKey: `object/${String(n)}`, expiresAt: '2099-01-01T00:00:00Z', uploadHeaders: { 'Content-Type': mediaType === 'photo' ? 'image/png' : 'video/mp4', 'If-None-Match': '*' } }, 201, seq));
  return { session, asset, url };
}
export function finish(evidence: S4MediaEvidence, chain: ReturnType<typeof create>, mediaType: 'photo' | 'video360', target = reception, omitPut = false) {
  evidence.observe(exchange('OPTIONS', chain.url, null, null, 204));
  if (!omitPut) {
    const seq = evidence.noteRequest('PUT', chain.url);
    const put = exchange('PUT', chain.url, null, null, 200, seq);
    evidence.observe({ ...put, requestHeaders: { ...put.requestHeaders, 'content-type': mediaType === 'photo' ? 'image/png' : 'video/mp4' } });
  }
  const complete = `${API}/api/v1/media/upload-sessions/${chain.session}/complete`;
  const seq = evidence.noteRequest('POST', complete);
  evidence.observe(exchange('POST', complete, null, { mediaAssetId: chain.asset, status: 'active', sizeBytes: mediaType === 'photo' ? 20 : 40, checksumSha256: null }, 200, seq));
  const body = { mediaAssetId: chain.asset };
  const attached = evidence.noteRequest('POST', `${API}/api/v1/receptions/${target}/media`, body);
  evidence.observe(exchange('POST', `${API}/api/v1/receptions/${target}/media`, body, { media: { mediaAssetId: chain.asset, mediaType, purpose: 'intake_evidence' } }, 201, attached));
}
export function operation(omitVideoPut = false, Evidence = S4MediaEvidence) {
  const evidence = new Evidence(API, R2, FRONTEND); evidence.beginUploadOperation(reception);
  const photo = create(evidence, 20, 'photo'); finish(evidence, photo, 'photo');
  const video = create(evidence, 21, 'video360'); finish(evidence, video, 'video360', reception, omitVideoPut);
  return { evidence, photo, video };
}
