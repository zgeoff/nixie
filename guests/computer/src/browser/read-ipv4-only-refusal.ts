import type { AddressCheck } from '@heynixie/egress';
import { formatIPv4OnlyReason, isIPv6Only, toBareHost } from '@heynixie/egress';
import type { ComputerReply } from '@heynixie/wire';

export interface IPv4OnlyCheck {
  readonly resolveHost: (host: string) => Promise<readonly string[]>;
  readonly checkAddress: AddressCheck;
}

// The refusal for an address whose host has only public IPv6 addresses, or null for any other
// address, including a host that does not resolve: the navigation then fails as it does. The
// proxy refuses such a host too, but a browser shows the model only that its tunnel failed.
export async function readIPv4OnlyRefusal(
  address: string,
  check: IPv4OnlyCheck,
): Promise<ComputerReply | null> {
  if (!URL.canParse(address)) {
    return null;
  }

  const host = toBareHost(new URL(address).hostname);

  const addresses = await check.resolveHost(host).catch(() => []);

  return isIPv6Only(addresses) && addresses.every((found) => check.checkAddress(found))
    ? { kind: 'failed', ok: false, reason: 'failed', message: formatIPv4OnlyReason(host) }
    : null;
}
