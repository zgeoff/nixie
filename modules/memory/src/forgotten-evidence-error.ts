export class ForgottenEvidenceError extends Error {
  override readonly name = 'ForgottenEvidenceError';

  readonly code = 'FORGOTTEN_EVIDENCE';

  constructor(recordSequence: number) {
    super(`the message at sequence ${String(recordSequence)} backed an item you forgot`);
  }
}
