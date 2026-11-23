import { removeSummaryKeys } from '@heynixie/compaction';
import { removeWebFetchThread } from '@heynixie/connectors';
import { writeRecords } from '@heynixie/log';
import { modelSessionCleanupCompletedCodec, modelSessionInvalidatedCodec } from '@heynixie/models';
import { conversationTaskID } from '@heynixie/tasks';
import type { ConversationRun, SessionCleanupCause } from '../types';
import { runGuestPurge } from '../utils/run-guest-purge';
import { waitForStepEnd } from '../utils/wait-for-step-end';

type CleanupRun = Pick<
  ConversationRun,
  'context' | 'harness' | 'sandbox' | 'command' | 'session' | 'clearFetchPauses'
>;

export function runSessionCleanup(run: CleanupRun, cause: SessionCleanupCause): Promise<void> {
  return run.session.withInvalidation(async () => {
    await waitForStepEnd(run.context, conversationTaskID);

    run.clearFetchPauses();

    await writeRecords(run.context.log, [
      {
        kind: modelSessionInvalidatedCodec.kind,
        definitions: run.context.definitions(),
        thread: conversationTaskID,
        payload: modelSessionInvalidatedCodec.encode(cause),
      },
    ]);

    await removeSummaryKeys(run.context.log, conversationTaskID);
    await removeWebFetchThread(run.context.log, conversationTaskID);
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
