import type { MemoryErasableRecordKind } from './memory-record-kind';

// The records of the memory store that hold label or item text. The memory's own removal takes
// them, so a record forget never does.
export const memoryItemErasableKinds = [
  'memory.fold_ordered',
  'memory.image_offered',
  'memory.proposal_rejected',
] as const satisfies readonly MemoryErasableRecordKind[];
