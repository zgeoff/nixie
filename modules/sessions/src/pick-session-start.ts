import type { HarnessSession } from '@heynixie/models';
import type { LiveSessionPosition, SessionPosition, SessionStart } from './types';

export function pickSessionStart(
  position: Exclude<SessionPosition, LiveSessionPosition>,
  session: HarnessSession | null,
): SessionStart {
  if (position.state === 'fresh') {
    return { kind: 'first' };
  }

  if (position.state === 'summarized') {
    return { kind: 'compaction' };
  }

  if (position.state === 'unkept') {
    return { kind: 'rebuild', reason: null, lostSessionID: null };
  }

  return {
    kind: 'rebuild',
    reason: position.state === 'invalidated' ? position.cause : 'lost',
    lostSessionID:
      position.boundary === null || session === null
        ? null
        : session.nameSession(position.boundary),
  };
}
