import { removeThreadLinks } from '@heynixie/connectors';
import { removeThreadKeys, writeRecords } from '@heynixie/log';
import { modelSessionInvalidatedCodec } from '@heynixie/models';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { ServerResetOptions } from './run-server-reset';

export interface ConversationReset {
  readonly resetAt: Date;
  readonly lastSequence: number;
  readonly shreddedRecords: number;
}

export async function runConversationReset(
  options: ServerResetOptions,
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

  await removeThreadLinks(log, conversationTaskID);

  const resetAt = new Date();

  await writeRecords(log, [
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

  return { resetAt, lastSequence: invalidated.sequence, shreddedRecords };
}
