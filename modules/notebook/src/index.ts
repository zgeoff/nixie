export type { NotebookRecordKind } from './record/notebook-record-kind';
export { noteErasableDescriptor } from './record/note-erasable-descriptor';
export { notebookProjections } from './projection/notebook-projections';
export { buildItemLinkCounts } from './count/build-item-link-counts';
export { buildNoteBodies } from './count/build-note-bodies';
export type { LinkingNote } from './count/read-notes-linking-event';
export { readNotesLinkingEvent } from './count/read-notes-linking-event';
export { readNoteForgetFloor } from './forget/read-note-forget-floor';
export { buildNotebookTools } from './tool/build-notebook-tools';
export type { NotebookToolStore } from './tool/notebook-tool-store';
export { buildNoteForgottenKind } from './event/build-note-forgotten-kind';
export { noteForgottenCodec } from './record/note-forgotten-codec';
export type { NotebookStore, StartNotebookOptions } from './start-notebook';
export { startNotebook } from './start-notebook';
export { notebookToolNames } from './tool/notebook-tool-names';
export { defaultNotebookSettings } from './types';
export { notebookConfigSchema } from './config/notebook-config-schema';
export type { NotebookConfig } from './config/notebook-config-schema';

export type {
  ClientBacklink,
  ClientLink,
  ClientNote,
  ClientNoteRead,
} from './client/read-client-note';

export type { ClientNoteList, ClientNoteSummary } from './client/list-client-notes';
export type { PrivateBodies } from './client/read-private-bodies';
export type { NoteOpened } from './client/write-note-opened';
export type { NotebookCheck } from './check/build-check';
export type { NoteForgetPreview, NoteForgetPreviewRead } from './forget/read-note-forget-preview';
export type { NoteForget, NoteForgetTarget } from './forget/run-note-forget';
export type { HistoryEntry } from './read/read-note-history';

export type {
  LinkTarget,
  LinkType,
  NotebookContext,
  NotebookMemory,
  NotebookSettings,
  NoteWriter,
} from './types';

export { buildNotebookMemory } from './memory/build-notebook-memory';
