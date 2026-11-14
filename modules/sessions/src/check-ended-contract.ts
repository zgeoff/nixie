import type { Harness } from '@heynixie/models';
import type { GuestFrame } from '@heynixie/wire';

type EndedFrame = Extract<GuestFrame, { type: 'ended' }>;

// A guest sends a session point exactly when its harness has a session, and a context size only
// when its harness declares context-window. Any other `ended` frame breaks the contract, so the
// step fails.
export function checkEndedContract(harness: Harness, ended: EndedFrame): void {
  const guest = harness.guest.package;

  if (ended.boundary !== undefined && harness.session === null) {
    throw new Error(
      `the ${guest} guest broke its contract: it sent a session point, and its harness has no session`,
    );
  }

  if (ended.boundary === undefined && harness.session !== null) {
    throw new Error(
      `the ${guest} guest broke its contract: it ended its turn with no session point, and its harness has a session`,
    );
  }

  if (ended.context !== undefined && !harness.capabilities.has('context-window')) {
    throw new Error(
      `the ${guest} guest broke its contract: it sent a context size, and its harness declares no context-window`,
    );
  }
}
