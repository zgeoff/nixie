import { normalizeAddress } from './normalize-address';

// The addresses that name someone besides the connection's own account, which is no guest of its
// own event.
export function collectOtherAddresses(addresses: readonly string[], account: string): string[] {
  const own = normalizeAddress(account);

  return [...new Set(addresses.map((address) => normalizeAddress(address)))].filter(
    (address) => address !== own,
  );
}
