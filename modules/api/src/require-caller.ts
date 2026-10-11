import type { APIContext, APIRequestContext, Identity } from './types';
import { verifySessionToken } from './verify-session-token';

// Resolves the caller of a procedure that needs a device session, and throws the procedure's typed
// UNAUTHORIZED when the session resolves to nobody.
export async function requireCaller(
  context: APIContext,
  request: APIRequestContext,
  buildUnauthorized: () => Error,
): Promise<Identity> {
  const caller = await verifySessionToken(context, request.sessionToken);

  if (caller === null) {
    throw buildUnauthorized();
  }
  return caller;
}
