export interface CaptureTag {
  // a lowercase version 4 UUID
  readonly captureID: string;

  // the capture's P-256 public key, uncompressed (65 bytes)
  readonly sealTo: Uint8Array;
}

export const captureIDPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
