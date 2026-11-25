import type { APIContext } from '../types';

// Opens the window of the session that just tapped, for the length that the settings give. A later
// tap restarts it.
export function openPasskeyWindow(
  context: Pick<APIContext, 'clock' | 'passkeys' | 'settings'>,
  identityID: string,
): void {
  const nowMs = context.clock.now();

  for (const [id, closesAtMs] of context.passkeys.windows) {
    if (nowMs >= closesAtMs) {
      context.passkeys.windows.delete(id);
    }
  }

  context.passkeys.windows.set(identityID, nowMs + context.settings.passkeyWindowMs);
}
