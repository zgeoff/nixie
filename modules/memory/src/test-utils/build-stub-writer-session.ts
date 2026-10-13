import { mock } from 'bun:test';
import type { WriterStaging } from '../create-writer-staging';
import { createWriterStaging } from '../create-writer-staging';
import type { WriterModel } from '../writer-types';

export type StubStagedWrite = Parameters<WriterStaging['stage']>[0];

export interface StubWriterSession {
  readonly staging: WriterStaging;

  // the model whose session stages the write each time it runs, and records each call
  readonly model: WriterModel & { readonly runSession: ReturnType<typeof mock> };
}

// A stand-in for the writer's model session and the staging its tools write to. Each session
// stages the one write into the batch the step opened, as a model that calls the remember or
// retire tool once does, and ends with fixed token counts.
export function buildStubWriterSession(write: StubStagedWrite): StubWriterSession {
  const staging = createWriterStaging();
  const runSession = mock(() => {
    staging.stage(write);
    return Promise.resolve({
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  return {
    staging,
    model: { model: 'claude-test-1', profile: 'writer-direct', runSession },
  };
}
