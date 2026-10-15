import type { APIContext, Identity } from './types';
import { verifySessionToken } from './verify-session-token';

// Resolves the caller of a procedure that needs a device session, and throws the procedure's typed
// UNAUTHORIZED when the session resolves to nobody.
export async function requireCaller(
  context: APIContext,
  sessionToken: string | undefined,
  buildUnauthorized: () => Error,
): Promise<Identity> {
  const caller = await verifySessionToken(context, sessionToken);

  if (caller === null) {
    throw buildUnauthorized();
  }

  return caller;
}
