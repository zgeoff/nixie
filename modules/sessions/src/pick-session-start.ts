import type { LiveSessionPosition, SessionPosition, SessionStart } from './types';

// How a session that does not resume opens. A session from before opening records holds the pinned
// core only in an old system prompt, so it opens again as a rebuild in place of a lost one.
export function pickSessionStart(
  position: Exclude<SessionPosition, LiveSessionPosition>,
): SessionStart {
  const lostSessionID = position.boundary?.sessionID ?? null;

  switch (position.state) {
    case 'fresh': {
      return { kind: 'first' };
    }
    case 'summarized': {
      return { kind: 'compaction' };
    }
    case 'invalidated': {
      return { kind: 'rebuild', reason: 'forget', lostSessionID };
    }
    case 'lost': {
      return { kind: 'rebuild', reason: 'lost', lostSessionID };
    }
  }
}
