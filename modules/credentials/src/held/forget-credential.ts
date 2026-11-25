import type { HeldBackend } from './types';

interface Forgetter {
  readonly backend: Pick<HeldBackend, 'readToken' | 'removeKey'>;
  readonly held: { readonly remove: (credentialID: string) => Promise<void> };
}

// Removes the credential, and then deletes the key that sealed its token, so nothing readable stays
// in the database or in a backup. The token is read here and never leaves.
export async function forgetCredential(forgetter: Forgetter, credentialID: string): Promise<void> {
  const token = await forgetter.backend.readToken(credentialID);

  await forgetter.held.remove(credentialID);

  if (token !== null) {
    await forgetter.backend.removeKey(token.keyID);
  }
}
