import type { Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';

export interface ModelReplyRecord {
  readonly thread: string;
  readonly text: string;
}

// Writes a reply of the model's as a conversation step writes one: a model.reply record in the
// thread, with its text in the erasable fields. It returns the record's sequence.
export async function writeModelReplyRecord(log: Log, reply: ModelReplyRecord): Promise<number> {
  const [record] = await writeRecords(log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: reply.thread,
      payload: { messageID: 'msg_test', model: 'claude-opus-5-5', profile: 'conversation' },
      erasable: { text: reply.text },
    },
  ]);

  invariant(record, 'the log wrote no model.reply record');

  return record.sequence;
}
