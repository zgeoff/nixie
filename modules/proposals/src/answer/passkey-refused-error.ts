import type { PasskeyRefusal } from './types';

export class PasskeyRefusedError extends Error {
  override readonly name = 'PasskeyRefusedError';

  readonly refusal: PasskeyRefusal;

  constructor(refusal: PasskeyRefusal) {
    super(`the passkey check refuses the answer: ${refusal.error}`);

    this.refusal = refusal;
  }
}
