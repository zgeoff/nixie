import type { LiveSessionPosition, SessionPosition, SessionStart } from './types';

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
    reason: position.state === 'invalidated' ? position.cause : 'lost',
    lostSessionID: position.boundary?.sessionID ?? null,
  };
}
