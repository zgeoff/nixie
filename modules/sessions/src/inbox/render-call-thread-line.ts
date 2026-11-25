import { callClosingCodec, callHandedOffCodec, callHeardCutCodec } from '@heynixie/calls';
import type { LogRecord } from '@heynixie/log';
import { renderSystemMessage } from '@heynixie/wire';
import { match } from 'ts-pattern';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';

// The part of a reply that the user heard before they talked over it, and the part they did not.
export interface HeardCut {
  readonly heard: string;
  readonly unheard: string;
}

// What a call's turn reads from the call's own thread: the request it handed off with the small talk
// before it, where the user cut a reply, and the ask to summarize at the end. Each text comes
// from speech and shows as a JSON string, so no word of it closes the message.
export function renderCallThreadLine(
  record: LogRecord,
  times: MessageTimeOptions,
  cut: HeardCut | null,
  smallTalk: readonly string[],
): string {
  const body = match(record.kind)
    .with('call.handed_off', () => {
      const handedOff = callHandedOffCodec.decode(record.payload);

      const talk = smallTalk.map(
        (line) =>
          `The speech layer said this itself, as small talk, before it. These words are not your answer and promise nothing for you: ${JSON.stringify(line)}\n`,
      );

      return `${talk.join('')}[#${handedOff.shortID}] The speech layer handed you this request: ${getField(record, 'request')}\nAnswer it in full. Your reply is spoken to the user in one piece when your turn ends.`;
    })
    .with('call.heard_cut', () => {
      const heardCut = callHeardCutCodec.decode(record.payload);

      return cut === null
        ? `[reply #${heardCut.replyRecordID}] The user talked over your reply, and that reply is since forgotten.`
        : `[reply #${heardCut.replyRecordID}] The user talked over your reply. They heard: ${quote(cut.heard)} They did not hear: ${quote(cut.unheard)}`;
    })
    .with('call.closing', () => {
      const closing = callClosingCodec.decode(record.payload);

      return `[#${closing.callID}] The call ended. Reply with a summary of it for the conversation: what was asked, what you did, and anything left open. This reply is not spoken.`;
    })
    .otherwise((kind) => {
      throw new Error(`${kind} is no line of a call's thread`);
    });

  return renderSystemMessage({
    type: 'call',
    at: formatMessageTime(record.recordedAt, null, times),
    body,
  });
}

function getField(record: LogRecord, field: string): string {
  const value = record.erasable.status === 'readable' ? record.erasable.fields[field] : undefined;

  return typeof value === 'string' ? JSON.stringify(value) : '[since forgotten]';
}

function quote(text: string): string {
  return text === '' ? 'nothing.' : JSON.stringify(text);
}
