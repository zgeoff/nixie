/* oxlint-disable max-statements, max-lines-per-function -- a throwaway spike report */
import { readFileSync } from 'node:fs';
import { conversation } from './conversation.ts';
import type { PlannedBatch } from './plan-batches.ts';
import type { JudgedCandidate } from './run-judge.ts';
import type { Usage } from './run-writer.ts';

// Prints the quality, delay and cost tables for one or more recorded runs, then the backfill
// estimate from a straight-line fit of input tokens against turns per batch.
interface Run {
  effort: string;
  model: string;
  plan: PlannedBatch[];
  samples: {
    batches: { plan: PlannedBatch; reportedUSD: number; usage: Usage; wallMs: number }[];
    candidates: {
      batch: number;
      index: number;
      outcome: string;
      reason: string | null;
      sourceID: number;
    }[];
    history: { active: boolean; id: string; versions: string[] }[];
    judge: { candidates: JudgedCandidate[]; error: string | null; usage: Usage };
    sample: number;
  }[];
}

// Claude Haiku 5.5 list prices in USD per million tokens. Claude Code asks for the 1-hour cache, so
// a cache write costs twice the input price.
const PRICES = { cacheRead: 0.01, cacheWrite: 0.2, input: 0.1, output: 0.5 };
// Samples run in parallel, so a batch can read a cache another sample wrote. A lone writer reads
// only the shared preamble from the cache and writes the rest, so the excess read is repriced as a
// write.
const SHARED_PREFIX = 1067;

const LONG_LOG_TURNS = 20_000;
// A real reply runs longer than the fixture's one-line replies; this sizes a turn for the estimate.
const LONG_TURN_TOKENS = 400;

const paths = process.argv.slice(2);
const runs = paths.map((path) => ({
  path,
  run: JSON.parse(readFileSync(path, 'utf8')) as Run,
}));
const points: { tokens: number; turns: number; usd: number; wallMs: number }[] = [];

for (const { path, run } of runs) {
  const ownerTurns = conversation.turns.length;
  console.log(`\n## ${path}: ${run.model}, effort ${run.effort}, ${run.plan.length} batches\n`);
  console.log(
    '| Sample | Gold captured | Partial | Gold sent to review | Bad applied | Bad stopped | Extra true facts | Judge error |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  const delays: number[] = [];
  const walls: number[] = [];
  const waits: number[] = [];
  let usd = 0;
  let reported = 0;
  let raw = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const sample of run.samples) {
    const labels = new Map(sample.judge.candidates.map((label) => [label.index, label]));
    const appliedGold = new Set<string>();
    const proposedGold = new Set<string>();
    let badApplied = 0;
    let badStopped = 0;
    let extra = 0;
    for (const candidate of sample.candidates) {
      const label = labels.get(candidate.index);
      if (label === undefined) {
        continue;
      }
      const applied = candidate.outcome === 'applied';
      if (label.label === 'gold' && label.ref !== null) {
        (applied ? appliedGold : proposedGold).add(label.ref);
        if (applied) {
          const batch = sample.batches[candidate.batch]!;
          const turn = conversation.turns[(candidate.sourceID - 1) / 2]!;
          if (batch.plan.startedAt !== null) {
            delays.push(batch.plan.startedAt + batch.wallMs / 60_000 - turn.at);
          }
        }
      } else if (label.label === 'acceptable') {
        extra += applied ? 1 : 0;
      } else if (applied) {
        badApplied += 1;
      } else {
        badStopped += 1;
      }
    }
    const active = sample.history.filter((item) => item.active).map((item) => item.versions.at(-1)!);
    let partial = 0;
    for (const [id, rule] of Object.entries(conversation.stale)) {
      const stale = active.some(
        (text) =>
          new RegExp(rule.stale, 'iu').test(text) &&
          (rule.fresh === null || !new RegExp(rule.fresh, 'iu').test(text)),
      );
      if (stale && appliedGold.delete(id)) {
        partial += 1;
      }
    }
    const reviewOnly = [...proposedGold].filter((id) => !appliedGold.has(id)).length;
    console.log(
      `| ${sample.sample} | ${appliedGold.size}/${Object.keys(conversation.gold).length} | ${partial} | ${reviewOnly} | ${badApplied} | ${badStopped} | ${extra} | ${sample.judge.error === null ? 'none' : 'yes'} |`,
    );
    for (const batch of sample.batches) {
      walls.push(batch.wallMs / 1000);
      const turns = batch.plan.end - batch.plan.start;
      const tokens = batch.usage.input + batch.usage.cacheWrite + batch.usage.cacheRead;
      const batchUSD = priceUsage(toSoloUsage(batch.usage));
      points.push({ tokens, turns, usd: batchUSD, wallMs: batch.wallMs });
      inputTokens += tokens;
      outputTokens += batch.usage.output;
      usd += batchUSD;
      raw += priceUsage(batch.usage);
      reported += batch.reportedUSD;
      if (batch.plan.startedAt !== null) {
        waits.push(batch.plan.startedAt - conversation.turns[batch.plan.start]!.at);
      }
    }
  }
  const count = run.samples.length;
  console.log(
    `\n- Extraction time per batch: median ${formatNumber(getQuantile(walls, 0.5))} s, 90th percentile ${formatNumber(getQuantile(walls, 0.9))} s, max ${formatNumber(Math.max(...walls))} s.`,
  );
  if (waits.length > 0) {
    console.log(
      `- Trigger wait from a batch's first turn: median ${formatNumber(getQuantile(waits, 0.5))} min, max ${formatNumber(Math.max(...waits))} min.`,
    );
    console.log(
      `- Capture delay for applied gold facts: median ${formatNumber(getQuantile(delays, 0.5))} min, 90th percentile ${formatNumber(getQuantile(delays, 0.9))} min, max ${formatNumber(Math.max(...delays))} min.`,
    );
  }
  console.log(
    `- Per sample: ${Math.round(inputTokens / count)} input tokens, ${Math.round(outputTokens / count)} output tokens, $${(usd / count).toFixed(5)} (as recorded $${(raw / count).toFixed(5)}, harness figure $${(reported / count).toFixed(5)}); $${((usd / count / ownerTurns) * 100).toFixed(4)} per 100 turns.`,
  );
}

const tokenFit = fitLine(points.map((point) => ({ turns: point.turns, value: point.tokens })));
const costFit = fitLine(points.map((point) => ({ turns: point.turns, value: point.usd })));
const wallFit = fitLine(points.map((point) => ({ turns: point.turns, value: point.wallMs })));
// A longer turn adds its extra tokens to the batch text, which Claude Code writes to the cache.
const longTurnUSD = ((LONG_TURN_TOKENS - tokenFit.slope) * PRICES.cacheWrite) / 1e6;
console.log(
  `\n## Backfill of ${LONG_LOG_TURNS} turns\n\nFit over ${points.length} batches: ${Math.round(tokenFit.intercept)} input tokens per batch + ${Math.round(tokenFit.slope)} per turn; $${costFit.intercept.toFixed(6)} per batch + $${costFit.slope.toFixed(6)} per turn; ${Math.round(wallFit.intercept)} ms per batch + ${Math.round(wallFit.slope)} ms per turn.\n`,
);
console.log(
  `| Turns per batch | Batches | Input tokens | Cost | Serial time | Cost at ${LONG_TURN_TOKENS}-token turns |`,
);
console.log('| --- | --- | --- | --- | --- | --- |');
for (const size of [4, 20, 40]) {
  const batches = Math.ceil(LONG_LOG_TURNS / size);
  const tokens = batches * tokenFit.intercept + LONG_LOG_TURNS * tokenFit.slope;
  const cost = batches * costFit.intercept + LONG_LOG_TURNS * costFit.slope;
  const hours = (batches * wallFit.intercept + LONG_LOG_TURNS * wallFit.slope) / 3.6e6;
  console.log(
    `| ${size} | ${batches} | ${formatMillions(tokens)} | $${cost.toFixed(2)} | ${hours.toFixed(1)} h | $${(cost + LONG_LOG_TURNS * longTurnUSD).toFixed(2)} |`,
  );
}

function toSoloUsage(usage: Usage): Usage {
  const excess = Math.max(0, usage.cacheRead - SHARED_PREFIX);
  return { ...usage, cacheRead: usage.cacheRead - excess, cacheWrite: usage.cacheWrite + excess };
}

function priceUsage(usage: Usage): number {
  return (
    (usage.input * PRICES.input +
      usage.cacheWrite * PRICES.cacheWrite +
      usage.cacheRead * PRICES.cacheRead +
      usage.output * PRICES.output) /
    1e6
  );
}

function getQuantile(values: number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))] ?? Number.NaN;
}

function fitLine(data: { turns: number; value: number }[]): { intercept: number; slope: number } {
  const meanX = data.reduce((sum, point) => sum + point.turns, 0) / data.length;
  const meanY = data.reduce((sum, point) => sum + point.value, 0) / data.length;
  const covariance = data.reduce(
    (sum, point) => sum + (point.turns - meanX) * (point.value - meanY),
    0,
  );
  const variance = data.reduce((sum, point) => sum + (point.turns - meanX) ** 2, 0);
  const slope = covariance / variance;
  return { intercept: meanY - slope * meanX, slope };
}

function formatNumber(value: number): string {
  return value.toFixed(1);
}

function formatMillions(value: number): string {
  return `${(value / 1e6).toFixed(1)} M`;
}
