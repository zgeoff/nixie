import type { IPAddress } from './parse-ip-address';
import { parseIPAddress } from './parse-ip-address';

export type AddressCheck = (address: string) => boolean;

export function makeAddressCheck(deniedRanges: readonly string[]): AddressCheck {
  const denied = deniedRanges.map((range) => parseIPRange(range));

  return (address) => {
    const parsed = parseIPAddress(address);

    return parsed !== null && isPublic(parsed, denied);
  };
}

interface IPRange {
  readonly family: 4 | 6;
  readonly base: bigint;
  readonly prefix: number;
}

function parseIPRange(text: string): IPRange {
  const [address = '', prefixText] = text.split('/');
  const parsed = parseIPAddress(address);
  const bits = parsed?.family === 4 ? 32 : 128;
  const prefix = prefixText === undefined ? bits : Number(prefixText);

  if (parsed === null || !/^\d{1,3}$/u.test(prefixText ?? '0') || prefix > bits) {
    throw new Error(`${text} is not an address or a network`);
  }

  return { family: parsed.family, base: parsed.value, prefix };
}

// RFC 6890's special-purpose ranges that never reach the global internet, with multicast, reserved
// and broadcast.
const ipv4NonPublic = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
].map((range) => parseIPRange(range));

const ipv6GlobalUnicast = parseIPRange('2000::/3');

const ipv6NonPublic = [
  '2001:2::/48',
  '2001:10::/28',
  '2001:20::/28',
  '2001:db8::/32',
  '3fff::/20',
].map((range) => parseIPRange(range));

function isPublic(address: IPAddress, denied: readonly IPRange[]): boolean {
  if (address.family === 4) {
    return ![...ipv4NonPublic, ...denied].some((range) => isInRange(address, range));
  }

  const embedded = findEmbeddedIPv4(address.value);

  if ([...ipv6NonPublic, ...denied].some((range) => isInRange(address, range))) {
    return false;
  }

  if (embedded === null) {
    return isInRange(address, ipv6GlobalUnicast);
  }

  return embedded.every((value) => isPublic({ family: 4, value }, denied));
}

function isInRange(address: IPAddress, range: IPRange): boolean {
  if (address.family !== range.family) {
    return false;
  }

  const shift = BigInt((range.family === 4 ? 32 : 128) - range.prefix);

  return address.value >> shift === range.base >> shift;
}

const low32 = (1n << 32n) - 1n;

const embeddings: readonly {
  readonly range: IPRange;
  readonly extract: (value: bigint) => readonly bigint[];
}[] = [
  { range: parseIPRange('::ffff:0:0/96'), extract: (value) => [value & low32] },

  { range: parseIPRange('::/96'), extract: (value) => [value & low32] },

  { range: parseIPRange('::ffff:0:0:0/96'), extract: (value) => [value & low32] },

  { range: parseIPRange('64:ff9b::/96'), extract: (value) => [value & low32] },

  { range: parseIPRange('2002::/16'), extract: (value) => [(value >> 80n) & low32] },

  // Teredo (RFC 4380) carries the server's address, and the client's address with every bit inverted.
  {
    range: parseIPRange('2001::/32'),
    extract: (value) => [(value >> 64n) & low32, ~value & low32],
  },
];

function findEmbeddedIPv4(value: bigint): readonly bigint[] | null {
  const embedding = embeddings.find((form) => isInRange({ family: 6, value }, form.range));

  return embedding === undefined ? null : embedding.extract(value);
}
