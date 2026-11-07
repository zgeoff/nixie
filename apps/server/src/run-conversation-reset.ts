import type { ForgetBackupState } from '@heynixie/api';
import { readForgetBackupState } from '@heynixie/api';
import { removeWebFetchThread } from '@heynixie/connectors';
import { removeThreadKeys, writeRecords } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import { modelSessionInvalidatedCodec } from '@heynixie/models';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { ServerResetOptions } from './run-server-reset';

export interface ConversationReset {
  readonly resetAt: Date;
  readonly lastSequence: number;
  readonly shreddedRecords: number;
  readonly backup: ForgetBackupState;
}

export interface ConversationResetOptions extends ServerResetOptions {
  readonly log: Logger;
}

export async function runConversationReset(
  options: ConversationResetOptions,
): Promise<ConversationReset> {
  const log = options.context.log;

  await options.stopWork();

  // The agent CLI keeps the conversation's transcript on its sandbox's disk, so a kept sandbox
  // would resume it.
  const sandboxes = await options.adapter.list(conversationTaskID);

  await Promise.all(sandboxes.map((sandbox) => sandbox.destroy()));

  const [invalidated] = await writeRecords(log, [
    {
      kind: modelSessionInvalidatedCodec.kind,
      definitions: options.context.definitions(),
      thread: conversationTaskID,
      payload: modelSessionInvalidatedCodec.encode({}),
    },
  ]);

  invariant(invalidated, 'the log wrote no model.session_invalidated record');

  const shreddedRecords = await removeThreadKeys(log, conversationTaskID);

  await removeWebFetchThread(log, conversationTaskID);

  const resetAt = new Date();

  const [logReset] = await writeRecords(log, [
    {
      kind: 'log_reset',
      definitions: options.context.definitions(),
      thread: conversationTaskID,
      payload: {
        resetAt: resetAt.getTime(),
        lastSequence: invalidated.sequence,
        mode: 'conversations',
        shreddedRecords,
      },
    },
  ]);

  invariant(logReset, 'the log wrote no log_reset record');

  // The keys are gone and the log_reset record is written, so a failed read of the backup state
  // must not report the finished reset as failed and start a second one on retry.
  const backup = await readForgetBackupState(options.context, {
    stage: 'forgotten',
    sequence: logReset.sequence,
  }).catch((error: unknown): ForgetBackupState => {
    options.log('reset.backup_state_failed', toErrorFields(error));

    return { state: 'unknown' };
  });

  return { resetAt, lastSequence: invalidated.sequence, shreddedRecords, backup };
}
