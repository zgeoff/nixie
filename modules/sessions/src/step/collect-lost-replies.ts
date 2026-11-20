import type { LogRecord } from '@heynixie/log';
import { modelReplyCodec, modelReplyVoidedCodec } from '@heynixie/models';
import type { DroppedReplies } from '../utils/build-reply-voids';

// The records run newest first, down to the thread's last step commit. A reply after that commit
// that no void names belongs to an attempt that died, so no step commit kept it.
export function collectLostReplies(
  records: Iterable<LogRecord>,
  fallbackRunID: string,
): readonly DroppedReplies[] {
  const voided = new Set<number>();
  const lost = new Map<string, number[]>();

  for (const record of records) {
    if (record.kind === 'task.step_committed') {
      break;
    }

    if (record.kind === modelReplyVoidedCodec.kind) {
      voided.add(modelReplyVoidedCodec.decode(record.payload).replySequence);
    } else if (record.kind === modelReplyCodec.kind && !voided.has(record.sequence)) {
      const runID = modelReplyCodec.decode(record.payload).runID ?? fallbackRunID;

      lost.set(runID, [...(lost.get(runID) ?? []), record.sequence]);
    }
  }

  return [...lost].map(([runID, sequences]) => ({ runID, sequences: sequences.toReversed() }));
}
