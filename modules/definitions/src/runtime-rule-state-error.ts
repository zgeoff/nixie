import type { RuntimeChangeState } from './types';

export class RuntimeRuleStateError extends Error {
  override readonly name = 'RuntimeRuleStateError';

  readonly code = 'WRONG_STATE';

  readonly state: RuntimeChangeState | null;

  constructor(changeID: string, state: RuntimeChangeState | null, to: RuntimeChangeState) {
    const message =
      state === null
        ? `no runtime rule change has ID ${changeID}`
        : `the runtime rule change ${changeID} is ${state}, so it cannot become ${to}`;

    super(message);

    this.state = state;
  }
}
