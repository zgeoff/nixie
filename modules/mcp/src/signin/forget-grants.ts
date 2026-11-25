import type { CredentialStore, HeldBackend } from '@heynixie/credentials';

export interface GrantForgetter {
  readonly store: CredentialStore;
  readonly backend: Pick<HeldBackend, 'readToken' | 'removeKey'>;
}

// Removes each credential from the store: the removal advances its counter, so a handle made before
// it refuses from then on, and the key that sealed its refresh token goes, so nothing readable
// stays in the database or in a backup.
export async function forgetGrants(
  forgetter: GrantForgetter,
  credentialIDs: readonly string[],
): Promise<void> {
  for (const credentialID of credentialIDs) {
    const token = await forgetter.backend.readToken(credentialID);

    await forgetter.store.remove({ backend: 'database', credentialID });

    if (token !== null) {
      await forgetter.backend.removeKey(token.keyID);
    }
  }
}
