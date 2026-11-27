import type { LogRecord } from '@heynixie/log';
import {
  modelReplyCodec,
  modelReplyVoidedCodec,
  modelSessionInvalidatedCodec,
} from '@heynixie/models';

// The user may have read the reply of a turn that a cleanup aborted, so the turn keeps it, with no
// void. Such a reply sits after the thread's last step commit and before the cleanup's
// session-invalidated record. The records run newest first.
export function collectKeptReplies(records: Iterable<LogRecord>): readonly number[] {
  const voided = new Set<number>();

  const kept: number[] = [];
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
      kept.push(record.sequence);
    }
  }

  return kept.toReversed();
}
