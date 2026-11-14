import type { MemoryErasableRecordKind } from './memory-record-kind';

// The records about a memory item that hold its text. The item's own removal takes them, so a
// record forget never does.
export const memoryItemErasableKinds = [
  'memory.image_offered',
  'memory.proposal_rejected',
  'memory.self_note_flagged',
] as const satisfies readonly MemoryErasableRecordKind[];
