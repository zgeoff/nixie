import { removeSummaryKeys } from '@heynixie/compaction';
import { writeRecords } from '@heynixie/log';
import type { RecordInput, RecordKind } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { runGuestPurge } from './run-guest-purge';
import type { ConversationRun, SessionCleanupCause } from './types';

type CleanupRun = Pick<ConversationRun, 'context' | 'sandbox' | 'command' | 'session'>;

// Cleans up the conversation's session after a forget: it aborts the running turn and waits for it,
// commits session_invalidated, deletes every summary's key, removes the guest's whole session state,
// and commits session_cleanup_completed, both naming the cause. A rerun is safe.
export function runSessionCleanup(run: CleanupRun, cause: SessionCleanupCause): Promise<void> {
  return run.session.withInvalidation(async () => {
    await writeRecords(run.context.log, [
      buildSessionRecord(run, 'model.session_invalidated', cause),
    ]);

    await removeSummaryKeys(run.context.log, conversationTaskID);
    await runGuestPurge(run);

    await writeRecords(run.context.log, [
      buildSessionRecord(run, 'model.session_cleanup_completed', cause),
    ]);
  });
}

function buildSessionRecord(
  run: CleanupRun,
  kind: RecordKind,
  cause: SessionCleanupCause,
): RecordInput {
  return {
    kind,
    definitions: run.context.definitions(),
    thread: conversationTaskID,
    payload: { ...cause },
  };
}
