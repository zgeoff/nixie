import { removeSummaryKeys } from '@heynixie/compaction';
import { removeThreadLinks } from '@heynixie/connectors';
import { writeRecords } from '@heynixie/log';
import { modelSessionCleanupCompletedCodec, modelSessionInvalidatedCodec } from '@heynixie/models';
import { conversationTaskID } from '@heynixie/tasks';
import { runGuestPurge } from './run-guest-purge';
import type { ConversationRun, SessionCleanupCause } from './types';

type CleanupRun = Pick<ConversationRun, 'context' | 'sandbox' | 'command' | 'session'>;

// Cleans up the conversation's session after a forget, in the order the memory context doc gives:
// session_invalidated, then the summary keys, the web fetch links and the guest's session state,
// then session_cleanup_completed, both records naming the cause. A rerun is safe.
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
    await removeThreadLinks(run.context.log, conversationTaskID);
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
