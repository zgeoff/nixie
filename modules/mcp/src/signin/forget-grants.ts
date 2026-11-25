import type { CredentialStore } from '@heynixie/credentials';

export interface GrantForgetter {
  readonly store: Pick<CredentialStore, 'forget'>;
}

// Forgets each credential in the store: the removal advances its counter, so a handle made before
// it refuses from then on, and the key that sealed its refresh token goes, so nothing readable
// stays in the database or in a backup. The store does it, and no token passes through here.
export async function forgetGrants(
  forgetter: GrantForgetter,
  credentialIDs: readonly string[],
): Promise<void> {
  for (const credentialID of credentialIDs) {
    await forgetter.store.forget({ backend: 'database', credentialID });
  }
}
