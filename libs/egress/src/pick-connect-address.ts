import { formatIPv4OnlyReason } from './format-ipv4-only-reason';
import { isIPv6Only } from './is-ipv6-only';
import type { AddressCheck } from './make-address-check';
import { parseIPAddress } from './parse-ip-address';

export type ConnectAddress =
  | { readonly kind: 'connect'; readonly address: string }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'ipv4-only'; readonly reason: string };

export function pickConnectAddress(
  host: string,
  addresses: readonly string[],
  checkAddress: AddressCheck,
  options: { readonly allowIPv6Only?: boolean } = {},
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

  if (options.allowIPv6Only !== true && isIPv6Only(addresses)) {
    return { kind: 'ipv4-only', reason: formatIPv4OnlyReason(host) };
  }

  const ipv4 = addresses.find((address) => parseIPAddress(address)?.family === 4);

  return { kind: 'connect', address: ipv4 ?? first };
}
