// A pin that would take the pinned core past its token budget. You unpin something first.
export class PinnedCoreFullError extends Error {
  override readonly name = 'PinnedCoreFullError';

  readonly code = 'PINNED_CORE_FULL';

  constructor(itemID: string | null, tokens: number, budget: number) {
    super(
      `pinning ${itemID === null ? 'a new memory item' : `memory item ${itemID}`} takes the pinned core to ${tokens} tokens, past its budget of ${budget}`,
    );
  }
}
