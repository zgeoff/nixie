import type { LogRecord } from '@heynixie/log';
import {
  modelReplyCodec,
  modelReplyVoidedCodec,
  modelSessionInvalidatedCodec,
} from '@heynixie/models';

// A turn that a cleanup aborted keeps its replies, with no void: they sit after the thread's last
// step commit and before the cleanup's session-invalidated record. The inbox records each kept
// reply names are answered. The records run newest first.
export function collectAnsweredSequences(records: Iterable<LogRecord>): ReadonlySet<number> {
  const voided = new Set<number>();
  const answered = new Set<number>();

  let isInvalidated = false;

  for (const record of records) {
    if (record.kind === 'task.step_committed') {
      break;
    }

    if (record.kind === modelSessionInvalidatedCodec.kind) {
      isInvalidated = true;
    } else if (record.kind === modelReplyVoidedCodec.kind) {
      voided.add(modelReplyVoidedCodec.decode(record.payload).replySequence);
    } else if (
      isInvalidated &&
      record.kind === modelReplyCodec.kind &&
      !voided.has(record.sequence)
    ) {
      for (const sequence of modelReplyCodec.decode(record.payload).readSequences ?? []) {
        answered.add(sequence);
      }
    }
  }

  return answered;
}
