import type { LookupFunction } from 'node:net';
import { isIP } from 'node:net';

// A lookup that answers with the address the caller checked, so no second resolution can differ.
export function makePinnedLookup(address: string): LookupFunction {
  const family = isIP(address);

  return (_hostname, lookupOptions, answer) => {
    if (lookupOptions.all === true) {
      answer(null, [{ address, family }]);
    } else {
      answer(null, address, family);
    }
  };
}
