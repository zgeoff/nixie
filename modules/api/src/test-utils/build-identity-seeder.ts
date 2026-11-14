import type { APIContext } from '../types';
import type { ClientActionSeed } from './seed-client-action';
import { seedClientAction } from './seed-client-action';
import type { IdentitySeed } from './seed-identity';
import { seedIdentity } from './seed-identity';
import { seedRevokedIdentity } from './seed-revoked-identity';

export interface IdentitySeederDeps {
  readonly context: APIContext;
}

export function buildIdentitySeeder(deps: IdentitySeederDeps) {
  return {
    identity: (input?: Partial<IdentitySeed>) => seedIdentity(deps.context, input),
    revokedIdentity: (input?: Partial<IdentitySeed>) => seedRevokedIdentity(deps.context, input),
    clientAction: (input?: Partial<ClientActionSeed>) => seedClientAction(deps.context, input),
  };
}
