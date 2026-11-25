import type { CredentialStore, HeldBackend, RevokeResult } from '@heynixie/credentials';
import type { ProviderEndpoints } from '../provider/google-endpoints';
import { readConnectionOwner } from './read-connection-owner';
import { readRecordedRevocations } from './read-recorded-revocations';
import type { RevocationWriter } from './write-revocation-recorded';
import { writeRevocationRecorded } from './write-revocation-recorded';

export interface RevocationDependencies extends RevocationWriter {
  readonly store: Pick<CredentialStore, 'register' | 'revoke'>;
  readonly backend: Pick<HeldBackend, 'readClient'>;
  readonly endpoints: ProviderEndpoints;

  // the connections whose revocation this process started, so a retry never sends it again
  readonly attempted: Set<string>;
}

const unknownResult: RevokeResult = { outcome: 'unknown', status: null, providerError: null };

// Sends the one revocation of a connection's grant and records its outcome in the log. It sends
// nothing for a connection whose outcome is recorded, and nothing for a second attempt of this
// process: a failure after the send records `unknown` and never sends again.
export async function revokeConnection(
  dependencies: RevocationDependencies,
  connectionID: string,
): Promise<void> {
  const recorded = await readRecordedRevocations(dependencies.log);

  if (recorded.has(connectionID)) {
    return;
  }

  if (dependencies.attempted.has(connectionID)) {
    await writeRevocationRecorded(dependencies, connectionID, unknownResult);

    return;
  }

  dependencies.attempted.add(connectionID);

  const result = await sendRevocation(dependencies, connectionID).catch(() => unknownResult);

  await writeRevocationRecorded(dependencies, connectionID, result);
}

async function sendRevocation(
  dependencies: RevocationDependencies,
  connectionID: string,
): Promise<RevokeResult> {
  const clientCredentialID = await readConnectionOwner(dependencies.log, connectionID);

  const client =
    clientCredentialID === null ? null : await dependencies.backend.readClient(clientCredentialID);

  if (client === null) {
    return { outcome: 'not_attempted', status: null, providerError: null };
  }

  const binding = await dependencies.store.register(
    { backend: 'database', credentialID: connectionID },
    {
      kind: 'oauth_token',
      label: 'Google connection',
      origins: dependencies.endpoints.origins,
      provider: {
        tokenURL: dependencies.endpoints.tokenURL,
        revokeURL: dependencies.endpoints.revokeURL,
        issuer: dependencies.endpoints.issuer,
        clientID: client.clientID,
      },
    },
  );

  return dependencies.store.revoke(binding);
}
