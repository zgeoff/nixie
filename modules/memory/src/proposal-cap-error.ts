export class ProposalCapError extends Error {
  override readonly name = 'ProposalCapError';

  readonly code = 'PROPOSAL_CAP';

  constructor(cap: number) {
    super(`this turn already made ${String(cap)} memory proposals, the most it may make`);
  }
}
