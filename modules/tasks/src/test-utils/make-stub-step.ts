import type { RunStep, StepInput } from '../types';

export function makeStubStep(
  act: (input: StepInput) => Promise<unknown> = () => Promise.resolve(),
): RunStep {
  return async (input) => {
    await act(input);

    return {
      next: 'wait',
      records: [],
      acknowledged: input.inbox.map((record) => record.sequence),
    };
  };
}
