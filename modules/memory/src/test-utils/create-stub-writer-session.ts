import { mock } from 'bun:test';
import { match } from 'ts-pattern';
import type { WriterStaging } from '../create-writer-staging';
import { createWriterStaging } from '../create-writer-staging';
import type { StagedFlag, WriterModel } from '../writer-types';

export type StubStagedWrite =
  | Parameters<WriterStaging['stage']>[0]
  | ({ readonly op: 'flag' } & StagedFlag);

export interface StubWriterSession {
  readonly staging: WriterStaging;

  readonly model: WriterModel & { readonly runSession: ReturnType<typeof mock> };
}

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
