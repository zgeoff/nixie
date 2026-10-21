import type { APIContext, Identity } from './types';
import { verifySessionToken } from './verify-session-token';

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
