import { mock } from 'bun:test';
import type { ChangeRequest, ConsolidationStaging } from '../create-consolidation-staging';
import { createConsolidationStaging } from '../create-consolidation-staging';
import type { WriterModel } from '../writer-types';

export interface StubConsolidatorSession {
  readonly staging: ConsolidationStaging;

  readonly model: WriterModel & { readonly runSession: ReturnType<typeof mock> };
}

export function createStubConsolidatorSession(
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
