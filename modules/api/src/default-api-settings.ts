import type { APISettings } from './types';

// The design's defaults: a code lapses unused after 15 min, and a session after 30 days without
// use. A stranger gets at most one refusal record an hour, and a session's last seen time moves at
// most once a minute, so a busy client does not write on every call.
export const defaultAPISettings: APISettings = {
  enrolmentCodeLifetimeMs: 15 * 60 * 1000,
  sessionIdleMs: 30 * 24 * 60 * 60 * 1000,
  refusalIntervalMs: 60 * 60 * 1000,
  lastSeenIntervalMs: 60 * 1000,
};
