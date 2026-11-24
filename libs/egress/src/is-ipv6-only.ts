import { parseIPAddress } from './parse-ip-address';

// Whether a host answered with addresses and every one of them is IPv6. Nixie's egress reaches
// IPv4 hosts only, so such a host cannot be reached.
export function isIPv6Only(addresses: readonly string[]): boolean {
  return (
    addresses.length > 0 && addresses.every((address) => parseIPAddress(address)?.family === 6)
  );
}
