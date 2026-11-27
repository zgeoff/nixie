import type { ErasableDescriptor } from '@heynixie/log';

// A text's own forget erases its record, its arrival and every wake that showed it, so no record
// kind of the phone module is open to a record forget. The send claim holds IDs alone.
export const phoneTextErasableDescriptor = {
  kind: 'phone_text',
  recordKinds: {
    erasable: ['phone.text_received'],
    forgettable: [],
    unforgettable: ['phone.send_claimed'],
  },
  legacyEnds: [],
} as const satisfies ErasableDescriptor;
