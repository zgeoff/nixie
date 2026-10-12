/* oxlint-disable max-statements -- a throwaway spike that keeps the run loop in one place */
// Runs every pair in cases.ts through the checker model with `claude -p` and appends one JSON line
// per call to the output file. A rerun skips the calls the file already holds.
//
//   bun run.ts --model claude-haiku-5-5 --repeats 3 --out results/haiku-5-5.jsonl
//
// `--marker evidence` renames the mark around the quote, which prompt.md calls «quote».
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { checkWrite, type OwnerMessage } from '../memory-checks/checks.ts';
import { type Pair, SAMPLES } from './cases.ts';

export type CheckerVerdict = 'asserted' | 'not_asserted' | 'unsure';

export interface CallRecord {
  asserted: boolean;
  bucket: string;
  costUSD: number;
  latencyMs: number;
  memory: string;
  model: string;
  pair: string;
  reason: string;
  repeat: number;
  verdict: CheckerVerdict;
}

const SCHEMA = JSON.stringify({
  additionalProperties: false,
  properties: {
    reason: { type: 'string' },
    verdict: { enum: ['asserted', 'not_asserted', 'unsure'], type: 'string' },
  },
  required: ['verdict', 'reason'],
  type: 'object',
});

if (import.meta.main) {
  await runAll();
}

async function runAll(): Promise<void> {
  const { values } = parseArgs({
    options: {
      budget: { default: '4', type: 'string' },
      concurrency: { default: '4', type: 'string' },
      marker: { default: 'quote', type: 'string' },
      model: { type: 'string' },
      out: { type: 'string' },
      repeats: { default: '3', type: 'string' },
    },
  });
  if (values.model === undefined || values.out === undefined) {
    throw new Error('pass --model and --out');
  }
  const model = values.model;
  const out = values.out;
  const marker = values.marker;
  const system = readFileSync(new URL('prompt.md', import.meta.url), 'utf8')
    .replaceAll('«quote»', `«${marker}»`)
    .replaceAll('«/quote»', `«/${marker}»`);
  const done = new Set(loadRecords(out).map((record) => `${record.pair}#${record.repeat}`));
  const budget = Number(values.budget);
  let spent = loadRecords(out).reduce((sum, record) => sum + record.costUSD, 0);

  const jobs: { input: string; key: string; pair: Pair; pairID: string; repeat: number }[] = [];
  for (const sample of SAMPLES) {
    for (const [index, pair] of sample.pairs.entries()) {
      const pairID = `${sample.id}/${index}`;
      const input = buildCheckerInput(sample.message, pair, marker);
      for (let repeat = 0; repeat < Number(values.repeats); repeat += 1) {
        const key = `${pairID}#${repeat}`;
        if (!done.has(key)) {
          jobs.push({ input, key, pair, pairID, repeat });
        }
      }
    }
  }
  console.log(`${jobs.length} calls to run on ${model}, $${spent.toFixed(4)} spent so far`);

  const workers = Array.from({ length: Number(values.concurrency) }, async () => {
    for (let job = jobs.shift(); job !== undefined; job = jobs.shift()) {
      if (spent >= budget) {
        console.log(`stopped at the $${budget} budget`);
        return;
      }
      const call = await runChecker(model, system, job.input);
      spent += call.costUSD;
      const record: CallRecord = {
        asserted: job.pair.asserted,
        bucket: job.pair.bucket,
        costUSD: call.costUSD,
        latencyMs: call.latencyMs,
        memory: job.pair.memory,
        model,
        pair: job.pairID,
        reason: call.reason,
        repeat: job.repeat,
        verdict: call.verdict,
      };
      appendFileSync(out, `${JSON.stringify(record)}\n`);
      const expected = job.pair.asserted ? 'asserted' : 'not_asserted';
      console.log(`${call.verdict === expected ? 'ok ' : 'BAD'} ${job.key} ${call.verdict}`);
    }
  });
  await Promise.all(workers);
  console.log(`$${spent.toFixed(4)} spent in total`);
}

export function loadRecords(path: string): CallRecord[] {
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as CallRecord);
}

// The checker's input: the owner's message with the quote and each pasted span marked, then the
// memory. A pair must pass the code checks first, as it would in the content gate. `marker` names
// the mark around the quote.
export function buildCheckerInput(message: OwnerMessage, pair: Pair, marker = 'quote'): string {
  const verdict = checkWrite(message, { memory: pair.memory, quote: pair.quote });
  if (!verdict.ok) {
    throw new Error(`the pair fails the code checks: ${verdict.reason}: ${pair.memory}`);
  }
  const quoteEnd = verdict.quoteAt + pair.quote.length;
  if (message.text.slice(verdict.quoteAt, quoteEnd) !== pair.quote) {
    throw new Error(`the quote is not verbatim in the message: ${pair.quote}`);
  }
  const marks: [number, string][] = [
    [verdict.quoteAt, `«${marker}»`],
    [quoteEnd, `«/${marker}»`],
  ];
  for (const span of message.spans) {
    if (span.source !== 'typed') {
      marks.push([span.start, '«pasted»'], [span.end, '«/pasted»']);
    }
  }
  // At one offset a closing mark goes before an opening one.
  const rank = (mark: string): number => (mark.startsWith('«/') ? 0 : 1);
  marks.sort((a, b) => a[0] - b[0] || rank(a[1]) - rank(b[1]));
  let text = '';
  let at = 0;
  for (const [offset, mark] of marks) {
    text += message.text.slice(at, offset) + mark;
    at = offset;
  }
  text += message.text.slice(at);
  return `<owner_message>\n${text}\n</owner_message>\n\n<candidate_memory>\n${pair.memory}\n</candidate_memory>`;
}

// One checker call. A failed call, an error or an unreadable answer counts as unsure, as in the
// design.
async function runChecker(
  model: string,
  system: string,
  input: string,
): Promise<{ costUSD: number; latencyMs: number; reason: string; verdict: CheckerVerdict }> {
  const started = performance.now();
  const child = Bun.spawn(
    [
      'claude',
      '-p',
      '--model',
      model,
      '--system-prompt',
      system,
      '--tools',
      '',
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--no-session-persistence',
      '--output-format',
      'json',
      '--max-budget-usd',
      '0.05',
      '--json-schema',
      SCHEMA,
      input,
    ],
    { stderr: 'pipe', stdout: 'pipe' },
  );
  const stdout = await new Response(child.stdout).text();
  await child.exited;
  const latencyMs = Math.round(performance.now() - started);
  try {
    const result = JSON.parse(stdout) as {
      structured_output?: { reason?: string; verdict?: CheckerVerdict };
      total_cost_usd?: number;
    };
    const verdict = result.structured_output?.verdict;
    return {
      costUSD: result.total_cost_usd ?? 0,
      latencyMs,
      reason: result.structured_output?.reason ?? 'no reason',
      verdict:
        verdict === 'asserted' || verdict === 'not_asserted' || verdict === 'unsure'
          ? verdict
          : 'unsure',
    };
  } catch {
    return { costUSD: 0, latencyMs, reason: `unreadable output: ${stdout.slice(0, 200)}`, verdict: 'unsure' };
  }
}
