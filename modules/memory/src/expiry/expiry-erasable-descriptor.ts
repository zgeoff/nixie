import type { ErasableDescriptor } from '@heynixie/log';

// An expiry removes the payload of a record that another descriptor lists, so it lists none of its
// own and ends no old forget.
export const expiryErasableDescriptor = {
  kind: 'expiry',
  recordKinds: { erasable: [], forgettable: [], unforgettable: [] },
  legacyEnds: [],
} as const satisfies ErasableDescriptor;
