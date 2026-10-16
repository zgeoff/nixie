import { removeSummaryKeys } from '@heynixie/compaction';
import { writeRecords } from '@heynixie/log';
import { modelSessionCleanupCompletedCodec, modelSessionInvalidatedCodec } from '@heynixie/models';
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
      {
        kind: modelSessionInvalidatedCodec.kind,
        definitions: run.context.definitions(),
        thread: conversationTaskID,
        payload: modelSessionInvalidatedCodec.encode(cause),
      },
    ]);

    await removeSummaryKeys(run.context.log, conversationTaskID);
    await runGuestPurge(run);

    await writeRecords(run.context.log, [
      {
        kind: modelSessionCleanupCompletedCodec.kind,
        definitions: run.context.definitions(),
        thread: conversationTaskID,
        payload: modelSessionCleanupCompletedCodec.encode(cause),
      },
    ]);
  });
}
