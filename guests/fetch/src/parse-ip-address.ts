import { isIPv4, isIPv6 } from 'node:net';

// An IP address as a number: 32 bits for IPv4 and 128 bits for IPv6.
export interface IPAddress {
  readonly family: 4 | 6;
  readonly value: bigint;
}

// Parses an IPv4 or IPv6 address in its text form, or returns null for any other text. An IPv6
// address may end in a dotted IPv4 address; a zone ID is refused, because no DNS answer holds one.
export function parseIPAddress(text: string): IPAddress | null {
  if (isIPv4(text)) {
    return { family: 4, value: parseIPv4(text) };
  }
  if (isIPv6(text) && !text.includes('%')) {
    return { family: 6, value: parseIPv6(text) };
  }
  return null;
}

function parseIPv4(text: string): bigint {
  return text.split('.').reduce((value, part) => (value << 8n) | BigInt(Number(part)), 0n);
}

function parseIPv6(text: string): bigint {
  const [head = '', tail] = text.split('::');
  const headGroups = splitGroups(head);
  const tailGroups = tail === undefined ? [] : splitGroups(tail);
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...Array.from({ length: missing }, () => 0n), ...tailGroups];

  return groups.reduce((value, group) => (value << 16n) | group, 0n);
}

// the groups of one side of '::', with a dotted IPv4 tail as its 2 groups
function splitGroups(text: string): readonly bigint[] {
  if (text.length === 0) {
    return [];
  }
  return text.split(':').flatMap((group) => {
    if (!group.includes('.')) {
      return [BigInt(`0x${group}`)];
    }
    const value = parseIPv4(group);

    return [value >> 16n, value & 0xff_ffn];
  });
}
