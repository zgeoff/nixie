import { MomentRefusedError } from './moment-refused-error';

interface MomentErrors {
  readonly MOMENT_NOT_FOUND?: () => Error;
  readonly STALE_VERSION?: () => Error;
  readonly BAD_SPAN?: () => Error;
}

export function toMomentError(error: unknown, errors: MomentErrors): unknown {
  if (!(error instanceof MomentRefusedError)) {
    return error;
  }

  const byReason: Readonly<Record<string, (() => Error) | undefined>> = {
    not_found: errors.MOMENT_NOT_FOUND,
    stale: errors.STALE_VERSION,
    bad_span: errors.BAD_SPAN,
  };

  const buildError = byReason[error.reason];

  return buildError === undefined ? error : buildError();
}
