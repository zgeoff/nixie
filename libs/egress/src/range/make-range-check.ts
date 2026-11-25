import type { AddressCheck } from '../make-address-check';
import { parseIPAddress } from '../parse-ip-address';
import { parseCIDR } from './parse-cidr';

// An address check that passes only an address inside one CIDR range. A range that does not parse
// passes nothing.
export function makeRangeCheck(range: string): AddressCheck {
  const parsedRange = parseCIDR(range);

  return (address) => {
    const parsed = parseIPAddress(address);

    return (
      parsedRange !== null &&
      parsed !== null &&
      parsed.family === parsedRange.family &&
      parsed.value >= parsedRange.first &&
      parsed.value <= parsedRange.last
    );
  };
}
