export function buildCaptureAAD(keyID: string, captureID: string): string {
  return `turn-input-capture#${keyID}#${captureID}`;
}
