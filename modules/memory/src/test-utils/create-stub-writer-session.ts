import { mock } from 'bun:test';
import { match } from 'ts-pattern';
import type { WriterStaging } from '../create-writer-staging';
import { createWriterStaging } from '../create-writer-staging';
import type { StagedFlag, WriterModel } from '../writer-types';

// A write the stub stages, or a flag of a possible self-note, which the stub flags instead.
export type StubStagedWrite =
  | Parameters<WriterStaging['stage']>[0]
  | ({ readonly op: 'flag' } & StagedFlag);

export interface StubWriterSession {
  readonly staging: WriterStaging;

  // the model whose session stages the write each time it runs, and records each call
  readonly model: WriterModel & { readonly runSession: ReturnType<typeof mock> };
}

// A stand-in for the writer's model session and the staging its tools write to. Each session
// stages the one write into the batch the step opened, as a model that calls the remember,
// retire or flag tool once does, and ends with fixed token counts.
export function createStubWriterSession(write: StubStagedWrite): StubWriterSession {
  const staging = createWriterStaging();

  const runSession = mock(() => {
    applyStubWrite(staging, write);

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

// the tool each op stages through; exhaustive() fails the type check when a new op has no branch
function applyStubWrite(staging: WriterStaging, write: StubStagedWrite): void {
  match(write)
    .with({ op: 'flag' }, (flag) => {
      staging.flag({ text: flag.text, sourceSequence: flag.sourceSequence });
    })
    .with({ op: 'remember' }, { op: 'retire' }, (staged) => {
      staging.stage(staged);
    })
    .exhaustive();
}
