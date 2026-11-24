import { waitAtFaultPoint } from '@heynixie/tasks';
import { verifySessionToken } from '../session/verify-session-token';
import type { APIContext, Identity } from '../types';

export async function requireCaller(
  context: APIContext,
  sessionToken: string | undefined,
  buildUnauthorized: () => Error,
): Promise<Identity> {
  const caller = await verifySessionToken(context, sessionToken);

  if (caller === null) {
    throw buildUnauthorized();
  }

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('session.checked', { kind: 'session', id: caller.identityID });
  }

  return caller;
}
