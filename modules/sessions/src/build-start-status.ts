import type { StatusEntry } from './build-status-registry';
import type { SessionStart } from './types';

export function buildStartStatus(): StatusEntry {
  return {
    name: 'start',
    read: (facts) =>
      Promise.resolve({ value: pickStartName(facts.start), text: renderStartLine(facts.start) }),
  };
}

function pickStartName(start: SessionStart): string {
  return start.kind === 'rebuild' ? `rebuild:${start.reason ?? 'unkept'}` : start.kind;
}

const historyLine = 'Earlier history is in the event log.';

type RebuildReason = NonNullable<Extract<SessionStart, { kind: 'rebuild' }>['reason']>;

const rebuildLines: Readonly<Record<RebuildReason, string>> = {
  lost: 'Start: a rebuild, because the earlier session was lost.',
  images: 'Start: a rebuild, because the earlier session held as many images as a session takes.',
  persona: 'Start: a rebuild, because the persona changed after the earlier session opened.',
  forget:
    'Start: a rebuild after a forget. The forget erased the summary of earlier sessions, so the gap is deliberate.',
};

function renderStartLine(start: SessionStart): string {
  if (start.kind === 'first') {
    return `Start: a new session. ${historyLine}`;
  }

  if (start.kind === 'compaction') {
    return `Start: after a compaction. The summary below is yours, written as the earlier session closed, and it covers every turn of that session. ${historyLine}`;
  }

  const line =
    start.reason === null
      ? 'Start: a rebuild, because the earlier session was not kept.'
      : rebuildLines[start.reason];

  return `${line} ${historyLine}`;
}
