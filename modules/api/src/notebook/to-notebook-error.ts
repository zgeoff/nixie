import { NoteRefusedError } from './note-refused-error';

interface NotebookErrors {
  readonly UNKNOWN_NOTE?: () => Error;
  readonly NOT_PRIVATE?: () => Error;
  readonly STALE_VERSION?: () => Error;
}

export function toNotebookError(error: unknown, errors: NotebookErrors): unknown {
  if (!(error instanceof NoteRefusedError)) {
    return error;
  }

  const byReason: Readonly<Record<string, (() => Error) | undefined>> = {
    unknown: errors.UNKNOWN_NOTE,
    not_found: errors.UNKNOWN_NOTE,
    not_private: errors.NOT_PRIVATE,
    stale: errors.STALE_VERSION,
  };

  const buildError = byReason[error.reason];

  return buildError === undefined ? error : buildError();
}
