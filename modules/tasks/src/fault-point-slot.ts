import type { FaultPointHandler } from './types';

// The handler the crash harness installs. A test build reads it at each fault point; the release
// bundle drops every read, because each one sits behind NIXIE_TEST_BUILD.
export const faultPointSlot: { handler: FaultPointHandler | null } = { handler: null };
