import type { ErasableDescriptor } from '@heynixie/log';
import type { MemoryErasableRecordKind } from './memory-record-kind';

// The records of the memory store that hold label or item text. The memory item's own forget takes
// them, so a record forget never does.
export const memoryItemErasableDescriptor = {
  kind: 'memory_item',
  recordKinds: {
    erasable: [
      'memory.fold_ordered',
      'memory.image_offered',
      'memory.proposal_rejected',
    ] satisfies readonly MemoryErasableRecordKind[],
    forgettable: [],
    unforgettable: [],
  },
  legacyEnds: [{ kind: 'memory.forgotten' }],
} as const satisfies ErasableDescriptor;
