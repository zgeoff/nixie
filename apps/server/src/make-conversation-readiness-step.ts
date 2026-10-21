import type { RunStep } from '@heynixie/tasks';
import type { StartState } from './build-start-state';

export function makeConversationReadinessStep(
  state: Pick<StartState, 'update'>,
  runStep: RunStep,
): RunStep {
  return async (input) => {
    const result = await runStep(input);

    state.update({ turns: { isReady: true, reason: null } });

    return result;
  };
}
