import { isIPv4, isIPv6 } from 'node:net';

export interface IPAddress {
  readonly family: 4 | 6;
  readonly value: bigint;
}

export function parseIPAddress(text: string): IPAddress | null {
  if (isIPv4(text)) {
    return { family: 4, value: parseIPv4(text) };
  }

  // A DNS answer never holds a zone ID, so an address with one is refused.
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
