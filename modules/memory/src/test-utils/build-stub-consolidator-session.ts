import { mock } from 'bun:test';
import type { ChangeRequest, ConsolidationStaging } from '../create-consolidation-staging';
import { createConsolidationStaging } from '../create-consolidation-staging';
import type { WriterModel } from '../writer-types';

export interface StubConsolidatorSession {
  readonly staging: ConsolidationStaging;

  // the model whose session stages the diff each time it runs, and records each call
  readonly model: WriterModel & { readonly runSession: ReturnType<typeof mock> };
}

// A stand-in for the consolidator's model session and the staging its tools write to. Each session
// stages the one diff, with the summary when one is given, into the run the step opened, as a
// model that calls memory.consolidate once does, and ends with fixed token counts.
export function buildStubConsolidatorSession(
  requests: readonly ChangeRequest[],
  summary?: string,
): StubConsolidatorSession {
  const staging = createConsolidationStaging();
  const runSession = mock(() => {
    staging.stage(requests, summary);
    return Promise.resolve({
      inputTokens: 400,
      outputTokens: 60,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  return {
    staging,
    model: { model: 'claude-test-1', profile: 'consolidator-direct', runSession },
  };
}
