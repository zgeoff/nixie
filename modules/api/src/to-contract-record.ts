import type { LogRecord as ContractRecord, Span } from '@heynixie/contract';
import type { LogRecord } from '@heynixie/log';

// Turns a log record into the record a client renders, or null for a record that belongs to no
// thread, such as a session or a refusal record, which no client view shows. Your message and the
// model's reply carry their text while its key exists; a forgotten one keeps its place with none.
export function toContractRecord(record: LogRecord): ContractRecord | null {
  if (record.thread === null) {
    return null;
  }
  const message = messageKinds.has(record.kind) ? toMessage(record) : undefined;

  return {
    kind: record.kind,
    ...(message === undefined ? {} : { message }),
    recordedAt: record.recordedAt,
    sequence: record.sequence,
    thread: record.thread,
  };
}

// your message, and a reply from the conversation's model
const messageKinds: ReadonlySet<string> = new Set(['owner_message', 'model.reply']);

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
