import type { ServiceContext } from '../service-context';
import { readKnownAccounts } from './read-known-accounts';

// True when a live connection other than the one named reaches the account. Google ends the whole
// grant of an account when any token of it is revoked, so such an account's tokens are never revoked.
export async function probeLiveAccount(
  context: ServiceContext,
  excludedID: string,
  subject: string | null,
): Promise<boolean> {
  if (subject === null) {
    return false;
  }

  const known = await readKnownAccounts(context, excludedID);

  return known.some((account) => account.binding === 'enabled' && account.subject === subject);
}
