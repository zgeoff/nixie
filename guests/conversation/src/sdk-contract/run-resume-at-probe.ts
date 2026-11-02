import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import invariant from 'tiny-invariant';
import { buildProbeOptions } from './build-probe-options';
import type { ResumeAtPlan, ResumeAtScenario } from './build-resume-at-plan';
import { buildResumeAtPlan } from './build-resume-at-plan';
import type { TranscriptEntry } from './load-session-transcript';
import { loadSessionTranscript } from './load-session-transcript';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import { runContractTurns } from './run-contract-turns';
import type { ProbeTarget } from './types';

export interface ResumeAtRun {
  readonly sessionID: string;
  readonly seed: ContractRun;
  readonly before: readonly TranscriptEntry[];
  readonly fork: ContractRun;
  readonly after: readonly TranscriptEntry[];
}

export async function runResumeAtProbe(
  target: ProbeTarget,
  scenario: ResumeAtScenario,
): Promise<ResumeAtRun> {
  const plan = buildResumeAtPlan(scenario);

  const options: Options = {
    ...buildProbeOptions(target),
    systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
  };

  const seed = await runSeed(options, plan);

  const boundary = getBoundary(seed.messages, plan.boundaryTurn);

  const before = await loadSessionTranscript(target.directory, boundary.session_id);

  const fork = await runContractQuery({
    prompt: 'What is the code word? Answer with the word only.',
    options: {
      ...options,
      resume: boundary.session_id,
      resumeSessionAt: boundary.uuid,
      forkSession: true,
    },
  });

  const after = await loadSessionTranscript(target.directory, boundary.session_id);

  return { sessionID: boundary.session_id, seed, before, fork, after };
}

function runSeed(options: Options, plan: ResumeAtPlan): Promise<ContractRun> {
  if (!plan.isLastTurnAborted) {
    return runContractTurns({ prompts: plan.prompts, options });
  }

  const abortController = new AbortController();

  const seen = { results: 0 };

  return runContractTurns({
    prompts: plan.prompts,
    options: { ...options, abortController, includePartialMessages: true },

    onMessage: (message) => {
      if (message.type === 'result') {
        seen.results += 1;
      }

      if (message.type === 'stream_event' && seen.results === plan.prompts.length - 1) {
        abortController.abort();
      }
    },
  });
}

function getBoundary(messages: readonly SDKMessage[], turn: number) {
  const ends = messages.flatMap((message, index) => (message.type === 'result' ? [index] : []));
  const end = ends[turn - 1] ?? messages.length;
  const boundary = messages.slice(0, end).findLast((message) => message.type === 'assistant');

  invariant(boundary, `turn ${turn} of the resume-at probe streamed no reply`);

  return boundary;
}
