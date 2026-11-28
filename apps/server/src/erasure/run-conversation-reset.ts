import type { ForgetBackupState } from '@heynixie/api';
import { readForgetBackupState } from '@heynixie/api';
import type { ErasureHandle } from '@heynixie/log';
import { erasureFinishedCodec, readErasureFinishedSequence, readRecords } from '@heynixie/log';
import { toErrorFields } from '@heynixie/logger';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { ServerResetOptions } from '../utils/run-server-reset';
import type { ConversationErasureRequest } from './build-conversation-erasable';

export interface ConversationReset {
  readonly resetAt: Date;
  readonly lastSequence: number;
  readonly removedKeys: number;

  // the same count under the name that the reply had before the reset ran as an erasure
  readonly shreddedRecords: number;
  readonly backup: ForgetBackupState;
}

export interface ConversationResetOptions extends Pick<ServerResetOptions, 'context' | 'log'> {
  readonly forgetConversation: ErasureHandle<ConversationErasureRequest>;
}

// Resets the conversations as an erasure of the conversation kind: its before hook stops the work,
// ends the session and destroys the guest, the runner deletes every key of the thread, and
// erasure.finished commits with the log_reset boundary.
export async function runConversationReset(
  options: ConversationResetOptions,
): Promise<ConversationReset> {
  const log = options.context.log;

  const begun = await options.forgetConversation.begin({ mode: 'conversations' }, { by: 'user' });

  // A reset that a crash left open finishes here, with the same result.
  if (begun.status === 'refused' && begun.reason !== 'already_begun') {
    throw new Error(`the reset of the conversations was refused as ${begun.reason}`);
  }

  await options.forgetConversation.finish(conversationTaskID);

  const finishedSequence = await readErasureFinishedSequence(
    log,
    'conversation',
    conversationTaskID,
  );

  invariant(finishedSequence !== null, 'the reset of the conversations finished');

  const [finished] = await readRecords(log, {
    afterSequence: finishedSequence - 1,
    sequences: [finishedSequence],
    limit: 1,
  });

  const [boundary] = await readRecords(log, {
    afterSequence: 0,
    kinds: ['log_reset'],
    order: 'newest',
    limit: 1,
  });

  invariant(finished && boundary, 'the reset wrote erasure.finished and log_reset');

  const removedKeys = erasureFinishedCodec.decode(finished.record.payload).removedKeys;

  // The keys are gone and the log_reset record is written, so a failed read of the backup state
  // must not report the finished reset as failed and start a second one on retry.
  const backup = await readForgetBackupState(options.context, {
    stage: 'forgotten',
    sequence: finishedSequence,
  }).catch((error: unknown): ForgetBackupState => {
    options.log('reset.backup_state_failed', toErrorFields(error));

    return { state: 'unknown' };
  });

  return {
    resetAt: new Date(Number(boundary.record.payload['resetAt'])),
    lastSequence: Number(boundary.record.payload['lastSequence']),
    removedKeys,
    shreddedRecords: removedKeys,
    backup,
  };
}
