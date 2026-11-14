import type { ProposalRefusal } from './proposal-kind-handler';

export class RefusedError extends Error {
  override readonly name = 'RefusedError';

  readonly refusal: ProposalRefusal;

  constructor(refusal: ProposalRefusal) {
    super(`the answer is refused: ${refusal.error}`);

    this.refusal = refusal;
  }
}
