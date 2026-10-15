import { writeRecords } from '@heynixie/log';
import type { RecordInput } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { runGuestPurge } from './run-guest-purge';
import type { ConversationRun } from './types';

type CleanupRun = Pick<ConversationRun, 'context' | 'sandbox' | 'command' | 'session'>;

// Cleans up the conversation's session after a forget: it aborts the running turn and waits for it
// to end, commits session_invalidated, removes the guest's whole session state, and commits
// session_cleanup_completed. The next turn rebuilds its session, and a rerun is safe.
export function runSessionCleanup(run: CleanupRun, itemID: string): Promise<void> {
  return run.session.withInvalidation(async () => {
    await writeRecords(run.context.log, [
      buildSessionRecord(run, 'model.session_invalidated', itemID),
    ]);

    await runGuestPurge(run);

    await writeRecords(run.context.log, [
      buildSessionRecord(run, 'model.session_cleanup_completed', itemID),
    ]);
  });
}

function buildSessionRecord(run: CleanupRun, kind: string, itemID: string): RecordInput {
  return {
    kind,
    definitions: run.context.definitions(),
    thread: conversationTaskID,
    payload: { itemID },
  };
}
