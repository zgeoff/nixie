import type { RuntimeChangeState } from '../types';

export class RuntimeTaskStateError extends Error {
  override readonly name = 'RuntimeTaskStateError';

  readonly code = 'WRONG_STATE';

  readonly state: RuntimeChangeState | null;

  constructor(changeID: string, state: RuntimeChangeState | null, to: RuntimeChangeState) {
    const message =
      state === null
        ? `no runtime task change has ID ${changeID}`
        : `the runtime task change ${changeID} is ${state}, so it cannot become ${to}`;

    super(message);

    this.state = state;
  }
}
