import type { LogRecord } from '@heynixie/log';
import { proposalsDeferredCodec, proposalsReturnedCodec } from '@heynixie/proposals';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from './format-message-time';
import type { MessageTimeOptions } from './types';

// The owner's Defer of a proposal that the task's own call asked for, and the proposal's return.
export function renderProposalDefer(record: LogRecord, times: MessageTimeOptions): string {
  const text =
    record.kind === proposalsDeferredCodec.kind
      ? renderDeferred(record, times)
      : renderReturned(record);

  return renderSystemMessage({
    type: 'approval',
    at: formatMessageTime(record.recordedAt, null, times),
    body: `[#${String(record.sequence)}] ${text}`,
  });
}

function renderDeferred(record: LogRecord, times: MessageTimeOptions): string {
  const deferred = proposalsDeferredCodec.decode(record.payload);
  const note = pickNote(record);
  const until = formatMessageTime(new Date(deferred.deferUntil), null, times);

  return `Deferred \`${deferred.shortID}\` until ${until}. It is not answered yet.${note === null ? '' : ` ${note}`}`;
}

function pickNote(record: LogRecord): string | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const note = record.erasable.fields['note'];

  return typeof note === 'string' && note !== '' ? note : null;
}

function renderReturned(record: LogRecord): string {
  return `The deferred proposal \`${proposalsReturnedCodec.decode(record.payload).shortID}\` is waiting for an answer again.`;
}
