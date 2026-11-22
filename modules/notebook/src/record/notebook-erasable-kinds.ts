import type { NotebookRecordKind } from './notebook-record-kind';

// The records that hold a note's own text. The note's own forget takes them, so a record forget
// never does.
export const notebookErasableKinds = [
  'notebook.note_written',
  'notebook.note_edited',
  'notebook.linked',
] as const satisfies readonly NotebookRecordKind[];
