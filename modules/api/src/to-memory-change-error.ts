interface MemoryChangeErrors {
  readonly MEMORY_ITEM_NOT_FOUND: () => Error;
  readonly STALE_VERSION: () => Error;
  readonly WRONG_STATE?: () => Error;
  readonly PINNED_CORE_FULL?: () => Error;
}

// Turns an error the memory store refused a change with into the typed error the contract
// declares for its code, such as STALE_VERSION, and leaves any other error as it is. A self-note's
// refusal, such as an edit across subjects, reads as the wrong state for that change.
export function toMemoryChangeError(error: unknown, errors: MemoryChangeErrors): unknown {
  const code = error instanceof Error && 'code' in error ? error.code : null;

  const byCode: Readonly<Record<string, (() => Error) | undefined>> = {
    NOT_FOUND: errors.MEMORY_ITEM_NOT_FOUND,
    STALE_VERSION: errors.STALE_VERSION,
    WRONG_STATE: errors.WRONG_STATE,
    SELF_NOTE_REFUSED: errors.WRONG_STATE,
    PINNED_CORE_FULL: errors.PINNED_CORE_FULL,
  };

  const buildError = typeof code === 'string' ? byCode[code] : undefined;

  return buildError === undefined ? error : buildError();
}
