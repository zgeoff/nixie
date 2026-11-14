import type { Writer } from '@heynixie/log';
import { checkDatabaseIntegrity } from '@heynixie/ops';
import { DEFAULT_MAX_STEP_ERRORS, readConversationErrors } from '@heynixie/tasks';
import type { StartState } from '../utils/build-start-state';
import { buildStartState } from '../utils/build-start-state';
import { formatFailedTurns } from '../utils/format-failed-turns';

export async function loadStartState(writer: Pick<Writer, 'db'>): Promise<StartState> {
  const database = await checkDatabaseIntegrity(writer.db);

  const state = buildStartState(database);

  if (!database.isReady) {
    state.update({
      turns: { isReady: false, reason: 'the database check at start failed' },
    });

    return state;
  }

  const conversation = await readConversationErrors(writer.db);

  if (conversation.isWaitingForRetry) {
    state.update({
      turns: {
        isReady: false,
        reason: `${formatFailedTurns(conversation.errors)}, the last waiting for a retry`,
      },
    });
  } else if (conversation.errors >= DEFAULT_MAX_STEP_ERRORS) {
    state.update({ turns: { isReady: false, reason: formatFailedTurns(conversation.errors) } });
  }

  return state;
}
