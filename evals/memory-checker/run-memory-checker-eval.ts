// oxlint-disable no-restricted-imports -- the eval swaps the brokered key for the local login

// Runs each corpus pair through the production checker, prompt and gate input, and writes the
// report the eval suite checks. It calls the model with the local Claude Code login, so CI never
// runs it: env -u ANTHROPIC_API_KEY bun evals/memory-checker/run-memory-checker-eval.ts <corpus|held-out>
import { mkdtemp } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { runCheckQuery } from '@heynixie/conversation';
import { memoryCheckerPrompt } from '@heynixie/memory';
import { makeChecker } from '@heynixie/models';
import { buildCheckerEvalInput } from '../test-utils/build-checker-eval-input';
import type { CheckerSample } from '../test-utils/load-checker-corpus';
import { loadCheckerCorpus } from '../test-utils/load-checker-corpus';
import type { CheckerCall, CheckerReport } from '../test-utils/load-checker-report';

const model = 'claude-sonnet-5-5';
const effort = 'low';
const repeats = 3;
const concurrency = 4;

interface PlannedCall {
  readonly sample: string;
  readonly pair: number;
  readonly repeat: number;
  readonly input: string;
}

const dir = import.meta.dir;
const name = process.argv[2] ?? 'corpus';
const corpus = await loadCheckerCorpus(join(dir, `${name}.json`));
const home = await mkdtemp(join(tmpdir(), 'nixie-checker-eval-'));
const planned = corpus.samples.flatMap((sample) => planSampleCalls(sample));
const calls = await runPlannedCalls(planned, home);
const report: CheckerReport = {
  model,
  effort,
  prompt: buildSHA256(memoryCheckerPrompt),
  repeats,
  calls,
};

await Bun.write(join(dir, `${name}-report.json`), `${JSON.stringify(report, null, 2)}\n`);

function planSampleCalls(sample: CheckerSample): readonly PlannedCall[] {
  return sample.pairs.flatMap((pair, index) =>
    Array.from({ length: repeats }, (_, repeat) => ({
      sample: sample.id,
      pair: index,
      repeat,
      input: buildCheckerEvalInput(sample, pair),
    })),
  );
}

async function runPlannedCalls(
  all: readonly PlannedCall[],
  guestHome: string,
): Promise<readonly CheckerCall[]> {
  const queue = [...all];
  const done: CheckerCall[] = [];
  const runWorker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      // oxlint-disable-next-line no-await-in-loop -- each worker runs its calls one at a time
      const call = await runCall(next, guestHome);

      done.push(call);
      process.stdout.write(`${done.length}/${all.length}\r`);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, runWorker));
  return done.toSorted(
    (left, right) =>
      left.sample.localeCompare(right.sample) ||
      left.pair - right.pair ||
      left.repeat - right.repeat,
  );
}

async function runCall(call: PlannedCall, guestHome: string): Promise<CheckerCall> {
  const cost = { usd: 0 };
  const check = makeChecker({
    model,
    ask: async (request, signal) => {
      const reply = await runCheckQuery(
        {
          profile: { model, baseURL: 'https://api.anthropic.com', effort, authHeader: 'x-api-key' },
          systemPrompt: request.prompt,
          input: request.input,
        },
        {
          env: { HOME: guestHome, ANTHROPIC_API_KEY: 'unused' },
          runQuery: makeLoggedInQuery(signal),
        },
      );

      if (reply.kind === 'failed') {
        throw new Error(reply.reason);
      }
      cost.usd = reply.costUSD;
      return reply.output;
    },
  });
  const started = performance.now();
  const answer = await check({ prompt: memoryCheckerPrompt, input: call.input });

  return {
    ...call,
    input: buildSHA256(call.input),
    verdict: answer.verdict,
    reason: answer.reason,
    failure: answer.failure,
    costUSD: cost.usd,
    latencyMs: Math.round(performance.now() - started),
  };
}

// Makes a query with the guest's options and the local login in place of the placeholder key the
// host would broker. The checker's timeout aborts the signal, which closes the query, so a timed-out
// call never runs on beside the next one or spends what the report leaves out.
function makeLoggedInQuery(signal: AbortSignal): typeof query {
  return (params) => {
    const { ANTHROPIC_API_KEY: _placeholder, ...env } = params.options?.env ?? {};
    const session = query({
      ...params,
      options: {
        ...params.options,
        env: { ...env, CLAUDE_CONFIG_DIR: join(homedir(), '.claude'), PATH: process.env['PATH'] },
      },
    });

    // the SDK's abort controller lets a query in flight finish and bill its answer; close ends it
    signal.addEventListener(
      'abort',
      () => {
        session.close();
      },
      { once: true },
    );
    return session;
  };
}

function buildSHA256(text: string): string {
  return `sha256:${new Bun.CryptoHasher('sha256').update(text).digest('hex')}`;
}
