import type { RunStep } from '@heynixie/tasks';
import type { StartState } from './build-start-state';

// Makes the conversation's step that marks the conversation imp ready after each turn that
// succeeds, which clears the mark that its failed turns at the error limit set.
export function makeConversationReadinessStep(
  state: Pick<StartState, 'update'>,
  runStep: RunStep,
): RunStep {
  return async (input) => {
    const result = await runStep(input);

    state.update({ conversation: { isReady: true, reason: null } });

    return result;
  };
}
