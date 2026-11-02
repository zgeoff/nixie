import type { HookCallbackMatcher, HookEvent, HookInput } from '@anthropic-ai/claude-agent-sdk';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { buildFiller } from './build-filler';
import { buildProbeOptions } from './build-probe-options';
import type { TranscriptEntry } from './load-session-transcript';
import { loadSessionTranscript } from './load-session-transcript';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import { runContractTurns } from './run-contract-turns';
import type { ProbeTarget } from './types';

export type PrecompactScenario = 'unblocked' | 'blocked';

export interface PrecompactRun {
  readonly run: ContractRun;
  readonly preCompacts: readonly HookInput[];
  readonly postCompacts: readonly HookInput[];
  readonly transcript: readonly TranscriptEntry[];
}

// The CLI compacts only a session of more than one turn, so the seed holds 2 turns of about 12,000
// tokens each, which stay under the default window.
export async function runPrecompactProbe(
  target: ProbeTarget,
  scenario: PrecompactScenario,
): Promise<PrecompactRun> {
  const options = {
    ...buildProbeOptions(target),
    systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
  };

  const seed = await runContractTurns({
    prompts: [
      `Keep these tide notes for later.\n${buildFiller(12_000, 'part 1')}\nReply with OK only.`,
      `More tide notes.\n${buildFiller(12_000, 'part 2')}\nReply with OK only.`,
    ],
    options,
  });

  const sessionID = seed.messages.at(-1)?.session_id;

  invariant(sessionID !== undefined, 'the seed of the precompact probe ended with no session');

  const preCompacts: HookInput[] = [];
  const postCompacts: HookInput[] = [];

  const recordPostCompact: HookCallbackMatcher = {
    hooks: [
      (input) => {
        postCompacts.push(input);

        return Promise.resolve({});
      },
    ],
  };

  const hooks = match(scenario)
    .returnType<Partial<Record<HookEvent, HookCallbackMatcher[]>>>()
    .with('unblocked', () => ({ PostCompact: [recordPostCompact] }))
    .with('blocked', () => ({
      PreCompact: [
        {
          hooks: [
            (input) => {
              preCompacts.push(input);

              return Promise.resolve({
                decision: 'block' as const,
                reason: 'nixie compacts the session itself',
              });
            },
          ],
        },
      ],
      PostCompact: [recordPostCompact],
    }))
    .exhaustive();

  const run = await runContractQuery({
    prompt: 'How many parts of tide notes do you hold? Answer with the number only.',
    options: {
      ...options,
      resume: sessionID,
      forkSession: true,

      // The CLI's auto-compaction fires at 15% of a 100,000-token window, under the seed's 24,000
      // tokens.
      env: {
        ...options.env,
        CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '15',
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: '100000',
      },
      hooks,
    },
  });

  const forkID = run.messages.at(-1)?.session_id;

  invariant(forkID !== undefined, 'the fork of the precompact probe ended with no session');

  const transcript = await loadSessionTranscript(target.directory, forkID);

  return { run, preCompacts, postCompacts, transcript };
}
