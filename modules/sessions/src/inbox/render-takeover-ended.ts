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

  const restart = fields.isRestarted
    ? ['The browser was closed and restarted during the take-over, so its earlier tabs are gone.']
    : [];

  const tabs =
    fields.tabs.length === 0
      ? []
      : [`Tabs: ${fields.tabs.map((open) => `${open.tab} ${toTabSite(open.origin)}`).join(', ')}`];

  return [...sites, ...restart, ...tabs, ...renderNow(fields.now, mint)];
}

// a secure site by its host alone, and any other with its scheme, so a plain address shows as one
function toSite(origin: string): string {
  return origin.startsWith('https://') ? origin.slice('https://'.length) : origin;
}

function toTabSite(origin: string | null): string {
  return origin === null ? 'a blank page' : toSite(origin);
}

function renderNow(now: EndedFields['now'], mint: () => string): string[] {
  if (now === null) {
    return [];
  }

  if (now.kind === 'other') {
    return now.title === undefined || now.title === ''
      ? ['Now: another window']
      : ['Now: window titled', ...renderUntrustedText(now.title, mint)];
  }

  const label = now.kind === 'browser' ? `browser tab ${now.tab}` : 'the terminal';

  if (now.text === '') {
    return [`Now: ${label}`];
  }

  return [`Now: ${label}`, ...renderUntrustedText(now.text, mint)];
}
