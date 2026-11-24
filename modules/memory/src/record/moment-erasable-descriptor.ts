import type { ErasableDescriptor } from '@heynixie/log';
import type { MemoryErasableRecordKind } from './memory-record-kind';

// The records that hold a moment's own title, note or reflection. The moment's own forget takes
// them, so a record forget never does.
export const momentErasableDescriptor = {
  kind: 'moment',
  recordKinds: {
    erasable: ['moment_kept', 'moment_edited'] satisfies readonly MemoryErasableRecordKind[],
    forgettable: [],
    unforgettable: [],
  },
  legacyEnds: [{ kind: 'moment_destroyed', where: { stage: 'done' } }],
} as const satisfies ErasableDescriptor;
