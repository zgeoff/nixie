import { parseIPAddress } from '@heynixie/egress';

export interface CIDRRange {
  readonly family: 4 | 6;

  // the first and the last address of the range, as numbers
  readonly first: bigint;
  readonly last: bigint;
}

// Reads one CIDR range such as 10.0.0.0/24 or fd00::/8. A range whose host bits are set reads as
// the range that holds them, and null means the text is no range.
export function parseCIDR(text: string): CIDRRange | null {
  const [address, prefixText, ...rest] = text.split('/');

  if (address === undefined || prefixText === undefined || rest.length > 0) {
    return null;
  }

  const parsed = parseIPAddress(address);

  if (parsed === null || !/^\d{1,3}$/u.test(prefixText)) {
    return null;
  }

  const bits = parsed.family === 4 ? 32 : 128;
  const prefix = Number(prefixText);

  if (prefix > bits) {
    return null;
  }

  const hostBits = BigInt(bits - prefix);
  const hostMask = (1n << hostBits) - 1n;
  const first = parsed.value & ~hostMask;

  return { family: parsed.family, first, last: first | hostMask };
}
