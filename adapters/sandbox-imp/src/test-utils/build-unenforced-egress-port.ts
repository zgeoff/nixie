import type { ImpPort } from '../types';

// @impz/testing's impd always enforces egress, and no option turns that off, so this port reports an
// impd that does not enforce it, with the rest of the features as impd reports them.
export function buildUnenforcedEgressPort(port: ImpPort): ImpPort {
  return {
    ...port,
    readFeatures: async (signal) => ({
      ...(await port.readFeatures(signal)),
      isEgressEnforced: false,
    }),
  };
}
