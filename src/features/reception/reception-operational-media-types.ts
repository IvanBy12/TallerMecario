export type ReceptionOperationalMediaType = 'photo' | 'video' | 'video360';

/** Client inputs only. Tenant context comes from the verified runtime separately. */
export interface ReceptionOperationalMediaInput {
  readonly receptionId: string;
  readonly mediaType: ReceptionOperationalMediaType;
  readonly mimeType: string;
  readonly expectedSizeBytes: number;
  readonly capturedAt?: string;
  readonly idempotencyKey: string;
}
export interface ReceptionMediaAssociationInput {
  readonly mediaAssetId: string;
  readonly sortOrder?: number;
}
export interface ReceptionMediaDto {
  readonly mediaAssetId: string;
  readonly mediaType: ReceptionOperationalMediaType;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly capturedAt: string | null;
  readonly uploadedAt: string | null;
  readonly purpose: 'intake_evidence';
  readonly sortOrder: number;
}
/** Transient capability: never persist, log or include in generic errors. */
export interface ReceptionMediaDownload {
  readonly mediaAssetId: string;
  readonly downloadUrl: string;
  readonly expiresAt: string;
}
