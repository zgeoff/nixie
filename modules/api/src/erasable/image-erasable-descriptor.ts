import type { ErasableDescriptor } from '@heynixie/log';

// An image forget ends with the record forgotten of the record that holds the image, so its end
// record is the record erasable's.
export const imageErasableDescriptor = {
  kind: 'image',
  recordKinds: { erasable: [], forgettable: [], unforgettable: [] },
  legacyEnds: [],
} as const satisfies ErasableDescriptor;
