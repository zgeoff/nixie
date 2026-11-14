import type { ApprovalRun } from './run-approval-answer';

export class SettledError extends Error {
  override readonly name = 'SettledError';

  readonly settlement: ApprovalRun;

  constructor(settlement: ApprovalRun) {
    super('the answer is settled');

    this.settlement = settlement;
  }
}
