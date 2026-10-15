// The turn, task run or writer batch has made as many memory proposals as the cap allows, so an
// injected instruction cannot flood the review queue. The write is dropped, and the model reads why.
export class ProposalCapError extends Error {
  override readonly name = 'ProposalCapError';

  readonly code = 'PROPOSAL_CAP';

  constructor(cap: number) {
    super(`this turn already made ${String(cap)} memory proposals, the most it may make`);
  }
}
