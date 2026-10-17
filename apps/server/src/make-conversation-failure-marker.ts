import { SandboxHostError } from '@heynixie/sandbox';
import { ModelAuthError } from '@heynixie/sessions';
import type { StepErrored } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import type { StartState } from './build-start-state';
import { formatFailedTurns } from './format-failed-turns';

// Makes the step error callback that marks the conversation's turns as failing, as an advisory
// part, once its errors in a row reach the error limit or at once on a refused model credential,
// which no retry passes. Its next turn that succeeds clears the mark.
export function makeConversationFailureMarker(
  state: Pick<StartState, 'update'>,
): (errored: StepErrored) => void {
  return (errored) => {
    if (errored.taskID !== conversationTaskID) {
      return;
    }

    if (errored.errors >= errored.errorLimit || errored.error instanceof ModelAuthError) {
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

  if (errored.error instanceof ModelAuthError) {
    return `${count}, the last because the model API refused the credential`;
  }

  return errored.error instanceof SandboxHostError
    ? `${count}, the last at the sandbox host with ${errored.error.code}`
    : count;
}
