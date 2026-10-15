import type { LiveSessionPosition, SessionPosition, SessionStart } from './types';

// How a session that does not resume opens. A session from before opening records holds the pinned
// core only in an old system prompt, so it opens again as a rebuild in place of a lost one.
export function pickSessionStart(
  position: Exclude<SessionPosition, LiveSessionPosition>,
): SessionStart {
  if (position.state === 'fresh') {
    return { kind: 'first' };
  }

  if (position.state === 'summarized') {
    return { kind: 'compaction' };
  }

  return {
    kind: 'rebuild',
    reason: position.state === 'invalidated' ? 'forget' : 'lost',
    lostSessionID: position.boundary?.sessionID ?? null,
  };
}
