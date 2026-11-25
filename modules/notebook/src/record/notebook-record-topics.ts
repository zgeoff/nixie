import type { LiveTopic } from '@heynixie/log';
import type { NotebookRecordKind } from './notebook-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const notebookRecordTopics = {
  'notebook.note_written': ['notebook'],
  'notebook.note_edited': ['notebook'],
  'notebook.linked': ['notebook'],
  'notebook.unlinked': ['notebook'],
  'notebook.note_read': ['notebook'],
  'notebook.private_opened': ['notebook'],
  'notebook.note_forgetting': ['notebook'],
  'notebook.note_forgotten': ['notebook'],
} as const satisfies Record<NotebookRecordKind, readonly LiveTopic[]>;
