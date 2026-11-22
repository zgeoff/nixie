// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';

const os = mockImplementer;

// The mock notebook holds no note, so each call that names one answers that no note has the ID.
export const mockNotebookProcedures = {
  listNotes: os.notebook.listNotes.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return { notes: [], next: null, isMeaningPartial: false };
  }),

  readNote: os.notebook.readNote.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.UNKNOWN_NOTE();
  }),

  openPrivate: os.notebook.openPrivate.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.UNKNOWN_NOTE();
  }),

  readCheck: os.notebook.readCheck.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return {
      orphans: [],
      dangling: [],
      repeatedReasons: [],
      orphanCount: 0,
      danglingCount: 0,
      repeatedReasonCount: 0,
    };
  }),

  previewForget: os.notebook.previewForget.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.UNKNOWN_NOTE();
  }),

  forget: os.notebook.forget.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.UNKNOWN_NOTE();
  }),
};
