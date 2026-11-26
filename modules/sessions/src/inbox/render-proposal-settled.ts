import type { LogRecord } from '@heynixie/log';
import { proposalsSettledCodec } from '@heynixie/proposals';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';

const familyNames = {
  action: 'action',
  memory: 'memory proposal',
  skill: 'skill write',
  rule_change: 'rule change',
  mcp: 'MCP change',
  prompt: 'prompt override',
} as const;

const outcomeWords = {
  approved: 'was approved',
  declined: 'was declined',
  lapsed: 'lapsed',
  withdrawn: 'was withdrawn',
} as const;

// The settlement of a proposal that the task's own call asked for, or that a task it started
// asked for. Each settlement that lands before the task's next wake reads as one line of one note.
export function renderProposalSettled(record: LogRecord, times: MessageTimeOptions): string {
  return renderSystemMessage({
    type: 'approval',
    at: formatMessageTime(record.recordedAt, null, times),
    body: `[#${String(record.sequence)}] ${renderSettledLine(record)}`,
  });
}

// One line of the note: who proposed it, what became of it, why, and what to do next.
export function renderSettledLine(record: LogRecord): string {
  const settled = proposalsSettledCodec.decode(record.payload);
  const reason = pickField(record, 'reason');
  const sentence = pickField(record, 'sentence');
  const family = familyNames[settled.family];
  const outcome = outcomeWords[settled.outcome];

  const lead =
    settled.task === null
      ? `Your ${family} ${settled.shortID}${sentence === null ? '' : ` (${sentence})`} ${outcome}`
      : `The task ${settled.task} proposed ${family} ${settled.shortID}. It ${outcome}`;

  const why = settled.outcome === 'declined' && reason !== null ? `: ${reason}` : '.';
  const replaced = settled.replaced === null ? '' : ` It replaced ${settled.replaced}.`;
  const detail = settled.detail === null ? '' : ` ${capitalize(settled.detail)}.`;

  return `${lead}${why}${replaced}${detail}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pickField(record: LogRecord, name: string): string | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const value = record.erasable.fields[name];

  return typeof value === 'string' && value !== '' ? value : null;
}
