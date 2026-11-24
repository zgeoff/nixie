import { parseIPAddress } from './parse-ip-address';

export function isIPv6Only(addresses: readonly string[]): boolean {
  return (
    addresses.length > 0 && addresses.every((address) => parseIPAddress(address)?.family === 6)
  );
}
