import type { StepErrored } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import type { StartState } from './build-start-state';

// Makes the step error callback that marks the conversation imp unready once the conversation's
// errors in a row reach the error limit. The conversation keeps retrying, so the mark is how its
// failures show; its next turn that succeeds clears it.
export function makeConversationFailureMarker(
  state: Pick<StartState, 'update'>,
): (errored: StepErrored) => void {
  return (errored) => {
    if (errored.taskID === conversationTaskID && errored.errors >= errored.errorLimit) {
      state.update({
        conversation: {
          isReady: false,
          reason: `the last ${String(errored.errors)} turns failed`,
        },
      });
    }
  };
}
