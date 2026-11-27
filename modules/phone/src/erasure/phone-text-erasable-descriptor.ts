import type { ErasableDescriptor } from '@heynixie/log';

// A text's own forget erases its record, its arrival and every wake that showed it, so no record
// kind of the phone module is open to a record forget.
export const phoneTextErasableDescriptor = {
  kind: 'text',
  recordKinds: {
    erasable: ['phone.text_received'],
    forgettable: [],
    unforgettable: [],
  },
  legacyEnds: [],
} as const satisfies ErasableDescriptor;
