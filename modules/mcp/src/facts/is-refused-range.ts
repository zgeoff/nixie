import { parseCIDR } from './parse-cidr';
import type { CIDRRange } from './parse-cidr';

const refusedRanges = [
  '127.0.0.0/8',
  '169.254.0.0/16',
  '0.0.0.0/32',
  '::1/128',
  'fe80::/10',
  '::/128',
]
  .map((text) => parseCIDR(text))
  .filter((range) => range !== null);

// Whether a range holds a loopback, link-local or unspecified address: such a range would send the
// proxy's request to the host itself.
export function isRefusedRange(range: CIDRRange): boolean {
  return refusedRanges.some(
    (refused) =>
      refused.family === range.family && range.first <= refused.last && refused.first <= range.last,
  );
}
