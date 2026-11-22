// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { mockViewStore } from './mock-view-store';
import { readMockBacklinks } from './read-mock-backlinks';
import { readMockNote } from './read-mock-note';
import { readMockNoteCheck } from './read-mock-note-check';
import { readMockNotePage } from './read-mock-note-page';
import { requireMockSession } from './require-mock-session';
import { writeMockNoteForget } from './write-mock-note-forget';
import { writeMockNoteOpen } from './write-mock-note-open';

const os = mockImplementer;

export const mockNotebookProcedures = {
  listNotes: os.notebook.listNotes.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return readMockNotePage(options.input);
  }),

  readNote: os.notebook.readNote.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const result = readMockNote(options.input);

    if (result.status === 'unknown') {
      throw options.errors.UNKNOWN_NOTE();
    }

    return result.status === 'hidden'
      ? { note: result.note, isPrivate: true as const }
      : result.note;
  }),

  openPrivate: os.notebook.openPrivate.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const result = await writeMockNoteOpen(options.input);

    if (result.status === 'failed') {
      throw new Error('The mock open failed');
    }

    if (result.status !== 'opened') {
      throw {
        unknown: options.errors.UNKNOWN_NOTE,
        not_private: options.errors.NOT_PRIVATE,
        reused: options.errors.CLIENT_ACTION_ID_REUSED,
      }[result.status]();
    }

    return {
      body: result.body,
      previousBody: result.previousBody,
      ownerOpenedAt: result.ownerOpenedAt,
    };
  }),

  readCheck: os.notebook.readCheck.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return readMockNoteCheck(options.input.showPrivate === true);
  }),

  previewForget: os.notebook.previewForget.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const row = mockViewStore.notes.findFirst((query) =>
      query.where((entry) => entry.note === options.input.note),
    );

    if (row === undefined || row.isForgotten || row.versions.length === 0) {
      throw options.errors.UNKNOWN_NOTE();
    }

    return {
      version: row.versions.length,
      title: row.versions.at(-1)?.title ?? '',
      versionCount: row.versions.length,
      linkCount: row.links.length,
      backlinkCount: readMockBacklinks(row.note, true).length,
    };
  }),

  forget: os.notebook.forget.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const result = await writeMockNoteForget(options.input);

    if (result.status !== 'forgotten') {
      throw {
        not_found: options.errors.UNKNOWN_NOTE,
        stale: options.errors.STALE_VERSION,
        reused: options.errors.CLIENT_ACTION_ID_REUSED,
      }[result.status]();
    }

    return { forgottenAt: result.forgottenAt, backup: { state: 'pending' as const } };
  }),
};
