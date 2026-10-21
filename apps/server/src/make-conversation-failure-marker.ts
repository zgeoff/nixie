import { SandboxHostError } from '@heynixie/sandbox';
import { ModelAuthError } from '@heynixie/sessions';
import type { StepErrored } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import type { StartState } from './build-start-state';
import { formatFailedTurns } from './format-failed-turns';

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

function formatFailureReason(errored: StepErrored): string {
  const count = formatFailedTurns(errored.errors);

  if (errored.error instanceof ModelAuthError) {
    return `${count}, the last because the model API refused the credential`;
  }

  return errored.error instanceof SandboxHostError
    ? `${count}, the last at the sandbox host with ${errored.error.code}`
    : count;
}
