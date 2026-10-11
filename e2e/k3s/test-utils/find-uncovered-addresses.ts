import { BlockList, isIP } from 'node:net';

// Finds each address that no range covers, in the order given. The fetch sandbox check passes the
// node's addresses and the cluster's pod and service addresses against the ranges the deployment
// lists as internal, because an address the list leaves out is reachable from a public sandbox.
export function findUncoveredAddresses(
  addresses: readonly string[],
  ranges: readonly string[],
): readonly string[] {
  const covered = new BlockList();

  for (const range of ranges) {
    const [network = '', prefix] = range.split('/');
    const family = toFamily(network, range);

    if (prefix === undefined) {
      covered.addAddress(network, family);
    } else {
      covered.addSubnet(network, Number(prefix), family);
    }
  }
  return addresses.filter((address) => !covered.check(address, toFamily(address, address)));
}

function toFamily(address: string, text: string): 'ipv4' | 'ipv6' {
  const version = isIP(address);

  if (version === 0) {
    throw new Error(`${text} is not an address or a network`);
  }
  return version === 4 ? 'ipv4' : 'ipv6';
}
