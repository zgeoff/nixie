import type { MemoryErasableRecordKind } from './memory-record-kind';

// The records that hold a moment's own title, note or reflection. The moment's own removal takes
// them, so a record forget never does.
export const momentErasableKinds = [
  'moment_kept',
  'moment_edited',
] as const satisfies readonly MemoryErasableRecordKind[];
