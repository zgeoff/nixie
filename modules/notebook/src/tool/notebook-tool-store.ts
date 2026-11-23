import type { NotebookCheck } from '../check/build-check';
import type { BegunNoteForget, NoteForgetTarget } from '../forget/run-note-forget';
import type { EditInput } from '../note/plan-edit';
import type { FindRequest, FoundNotes } from '../read/read-found-notes';
import type { NoteReadOutcome, NoteReadRequest } from '../read/read-note';
import type { NoteHistory } from '../read/read-note-history';
import type { NoteWriter } from '../types';
import type { NoteWalk, WalkAccess, WalkRequest } from '../walk/read-walk';
import type { NoteWrite, WriteNoteInput } from '../write/write-note';
import type { NoteEdit } from '../write/write-note-edit';
import type { LinkRequest, NoteLink } from '../write/write-note-link';
import type { NoteUnlink } from '../write/write-note-unlink';

// What the 10 tools reach: the notebook store, minus the client's calls.
export interface NotebookToolStore {
  readonly write: (caller: NoteWriter, input: WriteNoteInput) => Promise<NoteWrite>;
  readonly edit: (caller: NoteWriter, note: string, input: EditInput) => Promise<NoteEdit>;
  readonly read: (request: NoteReadRequest) => Promise<NoteReadOutcome>;
  readonly readHistory: (note: string, after: number | null) => Promise<NoteHistory>;
  readonly readFound: (request: FindRequest) => Promise<FoundNotes>;
  readonly readCheck: () => Promise<NotebookCheck>;
  readonly link: (request: LinkRequest) => Promise<NoteLink>;
  readonly unlink: (request: Omit<LinkRequest, 'reason'>) => Promise<NoteUnlink>;
  readonly walk: (access: WalkAccess, request: WalkRequest) => Promise<NoteWalk>;

  // runs the cleanup beside the call, which a turn's tool needs: the cleanup waits for the turn
  readonly forgetBeside: (target: NoteForgetTarget) => Promise<BegunNoteForget>;
}
