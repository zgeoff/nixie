import type { ErasableDescriptor } from '@heynixie/log';

// A connection's forget deletes keys that no log record is sealed under: no record kind of the
// connections module carries erasable fields, so every list is empty.
export const connectionErasableDescriptor = {
  kind: 'credential',
  recordKinds: { erasable: [], forgettable: [], unforgettable: [] },
  legacyEnds: [],
} as const satisfies ErasableDescriptor;
