import type { LogRecord } from '@heynixie/log';
import { toolCalledCodec } from '@heynixie/tools';

const textKinds: ReadonlySet<string> = new Set(['owner_message', 'model.reply']);

export function toMomentSpanRecord(record: LogRecord) {
  const erasable = record.erasable;
  const text = erasable.status === 'readable' ? erasable.fields['text'] : undefined;

  return {
    isGap: erasable.status === 'shredded' || erasable.status === 'unreadable',
    kind: record.kind,
    recordedAt: record.recordedAt,
    sequence: record.sequence,
    text: textKinds.has(record.kind) && typeof text === 'string' ? text : null,
    tool:
      record.kind === 'tool_called'
        ? (toolCalledCodec.tryDecodePartial(record.payload)?.tool ?? null)
        : null,
  };
}
