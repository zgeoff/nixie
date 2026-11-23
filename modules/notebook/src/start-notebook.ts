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
import type { BegunNoteForget, NoteForget, NoteForgetTarget } from './forget/run-note-forget';
import { beginNoteForget, runNoteForget } from './forget/run-note-forget';
import { startNoteIndex } from './index/start-note-index';
import { readNoteRow } from './note/read-note-row';
import { readFoundNotes } from './read/read-found-notes';
import { readNote } from './read/read-note';
import { readNoteHistory } from './read/read-note-history';
import type { NotebookToolStore } from './tool/notebook-tool-store';
import type { NoteForgetCaller, NotebookContext } from './types';
import { readWalk } from './walk/read-walk';
import { writeNote } from './write/write-note';
import { writeNoteEdit } from './write/write-note-edit';
import { writeNoteLink } from './write/write-note-link';
import { writeNoteUnlink } from './write/write-note-unlink';

// The notebook's own calls beside the tools': the client's reads, the owner's open of a private
// note, and the forget with a client action's hook.
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

  // finishes a forget whose first part committed; the note is a short ID or a UUID
  readonly finishForget: (note: string) => Promise<void>;

  // the sequence of the record that ended the note's forget, or null while the cleanup still runs
  readonly readForgottenSequence: (note: string) => Promise<number | null>;
  readonly readForgetFloor: (noteID: string) => Promise<number | null>;
  readonly readLinkingNotes: (sequence: number) => Promise<readonly LinkingNote[]>;

  // resolves once the cleanups that a tool's forget left running have ended
  readonly waitForForgets: () => Promise<void>;

  // resolves once the vectors of the notes read at start are encoded; true when they all were
  readonly waitForSemanticIndex: () => Promise<boolean>;
  readonly stop: () => Promise<void>;
}

export interface StartNotebookOptions extends NotebookContext {
  // without it, meaning search is never ready and a search reports a partial meaning
  readonly semanticSearch?: SemanticSearch;

  // the key of the step that the task of a thread runs, or null when none runs
  readonly readStartedStep: (thread: string) => Promise<string | null>;

  // the wait before a tool forget's cleanup checks the calling step again, or runs again after it
  // failed
  readonly cleanupRetryMs?: number;
}

const defaultCleanupRetryMs = 1000;

interface CallingStep {
  readonly thread: string;
  readonly stepKey: string;
}

// Starts the in-process indexes from every active note, and finishes each forget that a crash cut
// short.
export async function startNotebook(options: StartNotebookOptions): Promise<NotebookStore> {
  const context: NotebookContext = options;

  const index = await startNoteIndex({ log: context.log, semanticSearch: options.semanticSearch });

  await index.load();

  await runBegunNoteForgets(context, index);

  // A tool's forget runs inside a step, and the cleanup aborts every turn in flight, so it starts
  // only once the calling step has committed what it wrote. The cleanup runs again until it ends or
  // the notebook stops, and the next start finishes one that a stop cut short.
  const cleanups = new Map<string, Promise<void>>();

  const retryMs = options.cleanupRetryMs ?? defaultCleanupRetryMs;
  const state = { isStopping: false };

  const runFinishOnce = async (noteID: string, step: CallingStep | null): Promise<boolean> => {
    try {
      if (step !== null && (await options.readStartedStep(step.thread)) === step.stepKey) {
        return false;
      }

      await runBegunNoteForgets(context, index, noteID);

      return true;
    } catch {
      return false;
    }
  };

  const runFinishBeside = async (noteID: string, step: CallingStep | null): Promise<void> => {
    while (!state.isStopping && !(await runFinishOnce(noteID, step))) {
      await Bun.sleep(retryMs);
    }
  };

  const runTrackedFinish = async (noteID: string, step: CallingStep | null): Promise<void> => {
    try {
      await runFinishBeside(noteID, step);
    } finally {
      cleanups.delete(noteID);
    }
  };

  const forgetBeside = async (
    target: NoteForgetTarget,
    caller: NoteForgetCaller,
  ): Promise<BegunNoteForget> => {
    const begun = await beginNoteForget(context, target);

    if (begun.status === 'begun') {
      const stepKey = await options.readStartedStep(caller.thread);

      const step = stepKey === null ? null : { thread: caller.thread, stepKey };

      cleanups.set(begun.noteID, runTrackedFinish(begun.noteID, step));
    }

    return begun;
  };

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
    forgetBeside,

    listNotes: (request) => listClientNotes(context, index, request),
    readClientNote: (request) => readClientNote(context, index, request),
    readClientCheck: (isPrivateShown) => readCheck(context, index, { isPrivateShown }),
    readPrivateBodies: (request) => readPrivateBodies(context, request),
    writeOpened: (note, writeInTransaction) => writeNoteOpened(context, note, writeInTransaction),

    readForgetPreview: (note) => readNoteForgetPreview(context, note),
    forget: (target, writeInTransaction) =>
      runNoteForget(context, index, target, writeInTransaction),
    finishForget: async (note) => {
      const row = await readNoteRow(context.log.writer.db, note);

      if (row !== null) {
        await runBegunNoteForgets(context, index, row.note_id);
      }
    },
    readForgottenSequence: async (note) => {
      const row = await readNoteRow(context.log.writer.db, note);

      return row === null ? null : readNoteForgottenSequence(context.log, row.note_id);
    },
    readForgetFloor: (noteID) => readNoteForgetFloor(context.log, noteID),
    readLinkingNotes: (sequence) => readNotesLinkingEvent(context.log, sequence),

    waitForForgets: async () => {
      await Promise.all(cleanups.values());
    },
    waitForSemanticIndex: () => index.waitForLoadedVectors(),
    stop: async () => {
      state.isStopping = true;

      await Promise.all(cleanups.values());
      await index.stop();
    },
  };
}
