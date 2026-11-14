import { MomentRefusedError } from './moment-refused-error';

interface MomentErrors {
  readonly MOMENT_NOT_FOUND?: () => Error;
  readonly STALE_VERSION?: () => Error;
  readonly BAD_SPAN?: () => Error;
  readonly REFLECTION_NOT_FOUND?: () => Error;
  readonly MEMORY_ITEM_NOT_FOUND?: () => Error;
  readonly ALREADY_LINKED?: () => Error;
  readonly NOT_LINKED?: () => Error;
}

export function toMomentError(error: unknown, errors: MomentErrors): unknown {
  if (!(error instanceof MomentRefusedError)) {
    return error;
  }

  const byReason: Readonly<Record<string, (() => Error) | undefined>> = {
    not_found: errors.MOMENT_NOT_FOUND,
    stale: errors.STALE_VERSION,
    bad_span: errors.BAD_SPAN,
    reflection_not_found: errors.REFLECTION_NOT_FOUND,
    item_not_found: errors.MEMORY_ITEM_NOT_FOUND,
    already_linked: errors.ALREADY_LINKED,
    not_linked: errors.NOT_LINKED,
  };

  const buildError = byReason[error.reason];

  return buildError === undefined ? error : buildError();
}
