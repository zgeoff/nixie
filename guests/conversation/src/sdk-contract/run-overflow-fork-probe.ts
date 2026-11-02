import invariant from 'tiny-invariant';
import { buildFiller } from './build-filler';
import { buildOverflowOptions } from './build-overflow-options';
import type { TranscriptEntry } from './load-session-transcript';
import { loadSessionTranscript } from './load-session-transcript';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import { runContractTurns } from './run-contract-turns';
import type { ProbeTarget } from './types';

export interface OverflowForkRun {
  readonly sessionID: string;
  readonly seed: ContractRun;
  readonly original: readonly TranscriptEntry[];
  readonly fork: ContractRun;
  readonly forked: readonly TranscriptEntry[];
}

export async function runOverflowForkProbe(target: ProbeTarget): Promise<OverflowForkRun> {
  const options = buildOverflowOptions(target);

  const seed = await runContractTurns({
    prompts: [
      `Here are harbour notes to keep in mind:\n${buildFiller(14_000, 'note')}\nReply with OK only.`,
      'Use read_page to read pages 1, 2, 3 and 4, one call at a time and in that order. Then reply DONE.',
    ],
    options,
  });

  const firstEnd = seed.messages.findIndex((message) => message.type === 'result');

  const boundary = seed.messages
    .slice(0, firstEnd)
    .findLast((message) => message.type === 'assistant');

  invariant(boundary, 'the first turn of the overflow fork probe streamed no reply');

  const original = await loadSessionTranscript(target.directory, boundary.session_id);

  const fork = await runContractQuery({
    prompt: 'Reply with OK only.',
    options: {
      ...options,
      resume: boundary.session_id,
      resumeSessionAt: boundary.uuid,
      forkSession: true,
    },
  });

  const forkResult = fork.messages.at(-1);

  invariant(
    forkResult?.type === 'result',
    'the fork of the overflow fork probe ended with no result',
  );

  const forked = await loadSessionTranscript(target.directory, forkResult.session_id);

  return { sessionID: boundary.session_id, seed, original, fork, forked };
}
