import type { WriteTransaction } from '@heynixie/log';
import type { SemanticSearch } from '@heynixie/memory';
import type { NotebookCheck } from './check/build-check';
import { readCheck } from './check/read-check';
import type { ClientListRequest, ClientNoteList } from './client/list-client-notes';
import { listClientNotes } from './client/list-client-notes';
import type { ClientNoteRead, ClientNoteRequest } from './client/read-client-note';
import { readClientNote } from './client/read-client-note';
import type { PrivateBodies, PrivateBodiesRequest } from './client/read-private-bodies';
import { readPrivateBodies } from './client/read-private-bodies';
import type { NoteOpened } from './client/write-note-opened';
import { writeNoteOpened } from './client/write-note-opened';
import type { LinkingNote } from './count/read-notes-linking-event';
import { readNotesLinkingEvent } from './count/read-notes-linking-event';
import { readNoteForgetFloor } from './forget/read-note-forget-floor';
import type { NoteForgetPreviewRead } from './forget/read-note-forget-preview';
import { readNoteForgetPreview } from './forget/read-note-forget-preview';
import { readNoteForgottenSequence } from './forget/read-note-forgotten-sequence';
import { runBegunNoteForgets } from './forget/run-begun-note-forgets';
import type { NoteForget, NoteForgetTarget } from './forget/run-note-forget';
import { runNoteForget } from './forget/run-note-forget';
import { startNoteIndex } from './index/start-note-index';
import { readFoundNotes } from './read/read-found-notes';
import { readNote } from './read/read-note';
import { readNoteHistory } from './read/read-note-history';
import type { NotebookToolStore } from './tool/notebook-tool-store';
import type { NotebookContext } from './types';
import { readWalk } from './walk/read-walk';
import { writeNote } from './write/write-note';
import { writeNoteEdit } from './write/write-note-edit';
import { writeNoteLink } from './write/write-note-link';
import { writeNoteUnlink } from './write/write-note-unlink';

// The notebook's own calls beside the tools': the client's reads, the owner's open of a private
// note, and the forget.
export interface NotebookStore extends NotebookToolStore {
  readonly listNotes: (request: ClientListRequest) => Promise<ClientNoteList>;
  readonly readClientNote: (request: ClientNoteRequest) => Promise<ClientNoteRead>;
  readonly readClientCheck: (isPrivateShown: boolean) => Promise<NotebookCheck>;
  readonly readPrivateBodies: (request: PrivateBodiesRequest) => Promise<PrivateBodies>;
  readonly writeOpened: (
    note: string,
    writeInTransaction?: (tx: WriteTransaction) => Promise<void>,
  ) => Promise<NoteOpened>;

  readonly readForgetPreview: (note: string) => Promise<NoteForgetPreviewRead>;
  readonly forget: (
    target: NoteForgetTarget,
    writeInTransaction?: (tx: WriteTransaction) => Promise<void>,
  ) => Promise<NoteForget>;

  // finishes a forget whose first part committed
  readonly finishForget: (noteID: string) => Promise<void>;
  readonly readForgottenSequence: (noteID: string) => Promise<number | null>;
  readonly readForgetFloor: (noteID: string) => Promise<number | null>;
  readonly readLinkingNotes: (sequence: number) => Promise<readonly LinkingNote[]>;

  // resolves once the vectors of the notes read at start are encoded; true when they all were
  readonly waitForSemanticIndex: () => Promise<boolean>;
  readonly stop: () => Promise<void>;
}

export interface StartNotebookOptions extends NotebookContext {
  // without it, meaning search is never ready and a search reports a partial meaning
  readonly semanticSearch?: SemanticSearch;
}

// Starts the in-process indexes from every active note, and finishes each forget that a crash cut
// short.
export async function startNotebook(options: StartNotebookOptions): Promise<NotebookStore> {
  const context: NotebookContext = options;

  const index = await startNoteIndex({ log: context.log, semanticSearch: options.semanticSearch });

  await index.load();

  await runBegunNoteForgets(context, index);

  return {
    write: (caller, input) => writeNote(context, index, caller, input),
    edit: (caller, note, input) => writeNoteEdit(context, index, caller, { note, input }),
    read: (request) => readNote(context, index, request),
    readHistory: (note, after) => readNoteHistory(context, note, after),
    readFound: (request) => readFoundNotes(context, index, request),
    readCheck: () => readCheck(context, index, { isPrivateShown: true }),
    link: (request) => writeNoteLink(context, request),
    unlink: (request) => writeNoteUnlink(context, request),
    walk: (access, request) => readWalk(context, index, access, request),

    listNotes: (request) => listClientNotes(context, index, request),
    readClientNote: (request) => readClientNote(context, index, request),
    readClientCheck: (isPrivateShown) => readCheck(context, index, { isPrivateShown }),
    readPrivateBodies: (request) => readPrivateBodies(context, request),
    writeOpened: (note, writeInTransaction) => writeNoteOpened(context, note, writeInTransaction),

    readForgetPreview: (note) => readNoteForgetPreview(context, note),
    forget: (target, writeInTransaction) =>
      runNoteForget(context, index, target, writeInTransaction),
    finishForget: (noteID) => runBegunNoteForgets(context, index, noteID),
    readForgottenSequence: (noteID) => readNoteForgottenSequence(context.log, noteID),
    readForgetFloor: (noteID) => readNoteForgetFloor(context.log, noteID),
    readLinkingNotes: (sequence) => readNotesLinkingEvent(context.log, sequence),

    waitForSemanticIndex: () => index.waitForLoadedVectors(),
    stop: () => index.stop(),
  };
}
