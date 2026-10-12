// The message that backs a write backed an item you forgot after the gate found it, so the write
// waits for your review instead of applying.
export class ForgottenEvidenceError extends Error {
  override readonly name = 'ForgottenEvidenceError';
  readonly code = 'FORGOTTEN_EVIDENCE';

  constructor(recordSequence: number) {
    super(`the message at sequence ${String(recordSequence)} backed an item you forgot`);
  }
}
