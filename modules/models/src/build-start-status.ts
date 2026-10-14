import type { StatusEntry } from './build-status-registry';
import type { SessionStart } from './types';

// The status entry for the kind of start and its reason. Its line says that earlier history is in
// the event log, and after a forget, that the forget erased the summary of earlier sessions, so the
// model reads the gap as deliberate.
export function buildStartStatus(): StatusEntry {
  return {
    name: 'start',
    read: (facts) =>
      Promise.resolve({ value: pickStartName(facts.start), text: renderStartLine(facts.start) }),
  };
}

function pickStartName(start: SessionStart): string {
  return start.kind === 'first' ? 'first' : `rebuild:${start.reason}`;
}

const historyLine = 'Earlier history is in the event log.';

function renderStartLine(start: SessionStart): string {
  if (start.kind === 'first') {
    return `Start: a new session. ${historyLine}`;
  }
  if (start.reason === 'lost') {
    return `Start: a rebuild, because the earlier session was lost. ${historyLine}`;
  }
  return `Start: a rebuild after a forget. The forget erased the summary of earlier sessions, so the gap is deliberate. ${historyLine}`;
}
