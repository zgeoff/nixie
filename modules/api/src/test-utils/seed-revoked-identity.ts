import invariant from 'tiny-invariant';
import type { APIContext } from '../types';
import { writeSessionRevocation } from '../write-session-revocation';
import type { IdentitySeed, SeededIdentity } from './seed-identity';
import { seedIdentity } from './seed-identity';

export async function seedRevokedIdentity(
  context: APIContext,
  input: Partial<IdentitySeed> = {},
): Promise<SeededIdentity> {
  const identity = await seedIdentity(context, input);

  const result = await writeSessionRevocation(context, identity.caller, {
    clientActionID: crypto.randomUUID(),
    sessionID: identity.sessionID,
  });

  invariant(result.status === 'revoked', 'a live identity revokes itself');

  return identity;
}
