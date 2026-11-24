import type { ErasableDescriptor } from '@heynixie/log';
import type { NotebookRecordKind } from './notebook-record-kind';

// The records that hold a note's own text. The note's own forget takes them, so a record forget
// never does.
export const noteErasableDescriptor = {
  kind: 'note',
  recordKinds: {
    erasable: [
      'notebook.note_written',
      'notebook.note_edited',
      'notebook.linked',
    ] satisfies readonly NotebookRecordKind[],
    forgettable: [],
    unforgettable: [],
  },
  legacyEnds: [{ kind: 'notebook.note_forgotten' }],
} as const satisfies ErasableDescriptor;
