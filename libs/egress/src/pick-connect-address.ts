import { formatIPv4OnlyReason } from './format-ipv4-only-reason';
import { isIPv6Only } from './is-ipv6-only';
import type { AddressCheck } from './make-address-check';
import { parseIPAddress } from './parse-ip-address';

export type ConnectAddress =
  | { readonly kind: 'connect'; readonly address: string }
  | { readonly kind: 'refused'; readonly reason: string };

// Picks the address a connection to a host goes to, from every address the host resolved to. Every
// address must pass the check, so one non-public address among public ones refuses the host. A host
// with an IPv4 address connects to the first one, because nixie reaches IPv4 hosts only.
export function pickConnectAddress(
  host: string,
  addresses: readonly string[],
  checkAddress: AddressCheck,
): ConnectAddress {
  const [first] = addresses;
  const refused = addresses.find((address) => !checkAddress(address));

  if (first === undefined) {
    return { kind: 'refused', reason: `${host} resolves to no address` };
  }

  if (refused !== undefined) {
    return {
      kind: 'refused',
      reason: `${host} resolves to ${refused}, which is not a public address`,
    };
  }

  if (isIPv6Only(addresses)) {
    return { kind: 'refused', reason: formatIPv4OnlyReason(host) };
  }

  const ipv4 = addresses.find((address) => parseIPAddress(address)?.family === 4);

  return { kind: 'connect', address: ipv4 ?? first };
}
