import type { RuntimeChangeState } from './types';

export class WrittenSkillStateError extends Error {
  override readonly name = 'WrittenSkillStateError';

  readonly code = 'WRONG_STATE';

  readonly state: RuntimeChangeState | null;

  constructor(approvalID: string, state: RuntimeChangeState | null, to: RuntimeChangeState) {
    const message =
      state === null
        ? `no skill that nixie wrote has approval ${approvalID}`
        : `the skill approval ${approvalID} applied is ${state}, so it cannot become ${to}`;

    super(message);

    this.state = state;
  }
}
