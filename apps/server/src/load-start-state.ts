import type { Writer } from '@heynixie/log';
import { checkDatabaseIntegrity } from '@heynixie/ops';
import { DEFAULT_MAX_STEP_ERRORS, readConversationErrors } from '@heynixie/tasks';
import type { StartState } from './build-start-state';
import { buildStartState } from './build-start-state';
import { formatFailedTurns } from './format-failed-turns';

// The start state from the database as it opens: the integrity check, and the conversation's
// stored errors in a row, so a restart while turns fail keeps them failing until a turn succeeds.
// A database that fails its check is not read, and leaves the turns unchecked.
export async function loadStartState(writer: Pick<Writer, 'db'>): Promise<StartState> {
  const database = await checkDatabaseIntegrity(writer.db);

  const state = buildStartState(database);

  if (!database.isReady) {
    state.update({
      turns: { isReady: false, reason: 'the database check at start failed' },
    });

    return state;
  }

  const errors = await readConversationErrors(writer.db);

  if (errors >= DEFAULT_MAX_STEP_ERRORS) {
    state.update({ turns: { isReady: false, reason: formatFailedTurns(errors) } });
  }

  return state;
}
