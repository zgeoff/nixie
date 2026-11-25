import type { APIContext } from '../types';

// Ends the window of a session that signs out or is revoked.
export function closePasskeyWindow(
  context: Pick<APIContext, 'passkeys'>,
  identityID: string,
): void {
  context.passkeys.windows.delete(identityID);
}
