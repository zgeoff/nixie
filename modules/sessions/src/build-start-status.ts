import type { StatusEntry } from './build-status-registry';
import type { SessionStart } from './types';

// The status entry for the kind of start and its reason. Its line says that earlier history is in
// the event log, after a compaction that the summary covers the earlier session, and after a rebuild
// why the session opened again, so the model reads the gap as deliberate.
export function buildStartStatus(): StatusEntry {
  return {
    name: 'start',
    read: (facts) =>
      Promise.resolve({ value: pickStartName(facts.start), text: renderStartLine(facts.start) }),
  };
}

function pickStartName(start: SessionStart): string {
  return start.kind === 'rebuild' ? `rebuild:${start.reason}` : start.kind;
}

const historyLine = 'Earlier history is in the event log.';

type RebuildReason = Extract<SessionStart, { kind: 'rebuild' }>['reason'];

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

  return `${rebuildLines[start.reason]} ${historyLine}`;
}
