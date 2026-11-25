import type { APIContext } from '../types';

interface WindowOpening {
  readonly identityID: string;
  readonly passkeyID: string;
}

// Opens the window of the session that just tapped, for the length that the settings give. A later
// tap restarts it.
export function openPasskeyWindow(
  context: Pick<APIContext, 'clock' | 'passkeys' | 'settings'>,
  opening: WindowOpening,
): void {
  const nowMs = context.clock.now();

  for (const [id, window] of context.passkeys.windows) {
    if (nowMs >= window.closesAtMs) {
      context.passkeys.windows.delete(id);
    }
  }

  context.passkeys.windows.set(opening.identityID, {
    passkeyID: opening.passkeyID,
    closesAtMs: nowMs + context.settings.passkeyWindowMs,
  });
}
