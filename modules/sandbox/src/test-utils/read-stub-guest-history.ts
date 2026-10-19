import type { GuestFrame, SessionPoint } from '@heynixie/wire';
import type { GuestHome } from '../types';
import type { StubGuestDisk, StubSessionEntry } from './build-stub-guest-disk';

type HistoryRead =
  | { readonly history: readonly StubSessionEntry[] }
  | { readonly failure: GuestFrame };

// Reads the session entries up to the resume point, none for a fresh session, or the failure the
// CLI gives for a session the disk does not hold or a point the session does not hold.
interface GuestDiskRef {
  readonly disk: StubGuestDisk;
  readonly home: GuestHome;
}

export function readStubGuestHistory(run: GuestDiskRef, resume: SessionPoint | null): HistoryRead {
  if (resume === null) {
    return { history: [] };
  }

  const entries = run.disk.readSession(run.home, resume.sessionID);

  if (entries === null) {
    return {
      failure: {
        type: 'failed',
        reason: 'session_missing',
        detail: `No conversation found with session ID: ${resume.sessionID}`,
      },
    };
  }

  const at = entries.findIndex((entry) => entry.uuid === resume.messageID);

  if (at === -1) {
    return {
      failure: {
        type: 'failed',
        reason: 'error',
        detail: `No message found with message.uuid of: ${resume.messageID}`,
      },
    };
  }

  return { history: entries.slice(0, at + 1) };
}
