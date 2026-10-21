import type { NetworkInterfaceInfo } from 'node:os';

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
