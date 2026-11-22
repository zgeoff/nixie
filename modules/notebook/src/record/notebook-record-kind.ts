export type NotebookRecordKind =
  | 'notebook.note_written'
  | 'notebook.note_edited'
  | 'notebook.linked'
  | 'notebook.unlinked'
  | 'notebook.note_read'
  | 'notebook.private_opened'
  | 'notebook.note_forgetting'
  | 'notebook.note_forgotten';

type NotebookErasableRecordKind =
  | 'notebook.note_written'
  | 'notebook.note_edited'
  | 'notebook.linked';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<NotebookRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<NotebookErasableRecordKind, true> {}
}
