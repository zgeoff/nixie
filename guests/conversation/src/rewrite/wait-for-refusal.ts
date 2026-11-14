import type { RequestRewriter } from './start-request-rewriter';

export interface Refusal {
  readonly refusal: string;
}

// Settles with the rewriter's first refusal, and never settles for a turn with no rewriter.
export async function waitForRefusal(rewriter: RequestRewriter | null): Promise<Refusal> {
  if (rewriter === null) {
    return Promise.withResolvers<Refusal>().promise;
  }

  const error = await rewriter.refused;

  return { refusal: error.message };
}
