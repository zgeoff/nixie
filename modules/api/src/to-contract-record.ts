import type { LogRecord as ContractRecord, Span } from '@heynixie/contract';
import type { LogRecord } from '@heynixie/log';

// Turns a log record into the record a client renders, or null for a record that belongs to no
// thread, such as a session or a refusal record, which no client view shows. Your message carries
// its text and spans while its key exists; a forgotten message keeps its place with no text.
export function toContractRecord(record: LogRecord): ContractRecord | null {
  if (record.thread === null) {
    return null;
  }
  const message = record.kind === 'owner_message' ? toMessage(record) : undefined;

  return {
    kind: record.kind,
    ...(message === undefined ? {} : { message }),
    recordedAt: record.recordedAt,
    sequence: record.sequence,
    thread: record.thread,
  };
}

type Message = NonNullable<ContractRecord['message']>;

function toMessage(record: LogRecord): Message | undefined {
  if (record.erasable.status !== 'readable') {
    return undefined;
  }
  const text = record.erasable.fields['text'];
  const clientMessageId = record.payload['clientMessageId'];

  if (typeof text !== 'string') {
    return undefined;
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- writeOwnerMessage wrote the spans
  const spans = record.erasable.fields['spans'] as readonly Span[] | undefined;

  return {
    ...(typeof clientMessageId === 'string' ? { clientMessageId } : {}),
    ...(spans === undefined ? {} : { spans: [...spans] }),
    text,
  };
}
