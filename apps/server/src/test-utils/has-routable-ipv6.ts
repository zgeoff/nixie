import type { NetworkInterfaceInfo } from 'node:os';

// Tells whether a machine with these interfaces can open an IPv6 connection past its own link. A
// link-local address (fe80::/10) alone does not count, so an IPv4-only pod with only a link-local
// IPv6 address has no routable IPv6.
export function hasRoutableIPv6(
  interfaces: Readonly<Record<string, readonly Readonly<NetworkInterfaceInfo>[] | undefined>>,
): boolean {
  return Object.values(interfaces).some((entries) =>
    (entries ?? []).some(
      (entry) => entry.family === 'IPv6' && !entry.internal && !isLinkLocal(entry.address),
    ),
  );
}

function isLinkLocal(address: string): boolean {
  return /^fe[89ab]/iu.test(address);
}
