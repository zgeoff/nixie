import type { APIContext } from '../types';

interface WindowOpening {
  readonly identityID: string;
  readonly passkeyID: string;
}

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
