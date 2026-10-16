import { SandboxHostError } from '@heynixie/sandbox';
import type { StepErrored } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import type { StartState } from './build-start-state';
import { formatFailedTurns } from './format-failed-turns';

// Makes the step error callback that marks the conversation's turns as failing once its errors in
// a row reach the error limit, as an advisory part, because nixie still answers while turns fail.
// The conversation keeps retrying, and its next turn that succeeds clears the mark.
export function makeConversationFailureMarker(
  state: Pick<StartState, 'update'>,
): (errored: StepErrored) => void {
  return (errored) => {
    if (errored.taskID === conversationTaskID && errored.errors >= errored.errorLimit) {
      state.update({
        turns: {
          isReady: false,
          reason: formatFailureReason(errored),
        },
      });
    }
  };
}

// the host's code is a name for the failure, never its text, so the reason may carry it
function formatFailureReason(errored: StepErrored): string {
  const count = formatFailedTurns(errored.errors);

  return errored.error instanceof SandboxHostError
    ? `${count}, the last at the sandbox host with ${errored.error.code}`
    : count;
}
