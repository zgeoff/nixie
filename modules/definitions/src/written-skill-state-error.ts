import type { WrittenSkillState } from './types';

// The skill that nixie wrote cannot move to that state: it left force, or no approval applied it.
export class WrittenSkillStateError extends Error {
  override readonly name = 'WrittenSkillStateError';

  readonly code = 'WRONG_STATE';

  // where the skill stands, or null when no approval has that ID
  readonly state: WrittenSkillState | null;

  constructor(approvalID: string, state: WrittenSkillState | null, to: WrittenSkillState) {
    const message =
      state === null
        ? `no skill that nixie wrote has approval ${approvalID}`
        : `the skill approval ${approvalID} applied is ${state}, so it cannot become ${to}`;

    super(message);

    this.state = state;
  }
}
