import { takeoverEndedCodec, takeoverEndedFieldsSchema } from '@heynixie/connectors';
import type { LogRecord } from '@heynixie/log';
import { mintBlockID, renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';
import { capitalizeFirst } from './capitalize-first';
import { renderUntrustedText } from './render-untrusted-text';

// What the assistant reads when the desktop comes back, in the owner's name, or "the user" when none
// is set.
export function renderTakeoverEnded(
  record: LogRecord,
  times: MessageTimeOptions,
  ownerName: string | null,
  mint: () => string = mintBlockID,
): string {
  const ended = takeoverEndedCodec.decode(record.payload);
  const name = ownerName ?? 'the user';
  const duration = formatDuration(ended.durationSeconds);

  const first = {
    user: `${capitalizeFirst(name)} handed the computer back after ${duration}.`,
    assistant: `You took the computer back from ${name} after ${duration}.`,
    idle: `The computer came back to you after ${duration} with no input from ${name}.`,
    restart: 'The computer came back to you when nixie restarted.',
  }[ended.by];

  const fields = parseEndedFields(record);

  return renderSystemMessage({
    type: 'computer',
    at: formatMessageTime(record.recordedAt, null, times),
    body: [`[#${ended.shortID}] ${first}`, ...renderSeen(fields, mint)].join('\n'),
  });
}

function formatDuration(seconds: number): string {
  return seconds < 60 ? `${String(seconds)} sec` : `${String(Math.round(seconds / 60))} min`;
}

type EndedFields = ReturnType<typeof takeoverEndedFieldsSchema.parse>;

function parseEndedFields(record: LogRecord): EndedFields | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const parsed = takeoverEndedFieldsSchema.safeParse(record.erasable.fields);

  return parsed.success ? parsed.data : null;
}

// The sites, and the window in focus with its text inside the markers that a page read shows. The
// text is escaped as a page read escapes it, so no text can write a closing marker.
function renderSeen(fields: EndedFields | null, mint: () => string): string[] {
  if (fields === null) {
    return [];
  }

  const sites =
    fields.origins.length === 0 ? [] : [`Sites: ${fields.origins.map(toSite).join(' → ')}`];

  const now = fields.now;

  if (now === null) {
    return sites;
  }

  if (now.kind === 'other') {
    return [...sites, 'Now: another window'];
  }

  const label = now.kind === 'browser' ? `browser tab ${now.tab}` : 'the terminal';

  if (now.text === '') {
    return [...sites, `Now: ${label}`];
  }

  return [...sites, `Now: ${label}`, ...renderUntrustedText(now.text, mint)];
}

// a secure site by its host alone, and any other with its scheme, so a plain address shows as one
function toSite(origin: string): string {
  return origin.startsWith('https://') ? origin.slice('https://'.length) : origin;
}
