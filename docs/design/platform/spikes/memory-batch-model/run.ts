/* oxlint-disable max-statements, max-lines-per-function -- a throwaway spike that keeps each pass in one place */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { checkQuote, checkWrite } from '../memory-checks/checks.ts';
import type { OwnerMessage, Span } from '../memory-checks/checks.ts';
import { buildJudgeInput } from './build-judge-input.ts';
import { conversation } from './conversation.ts';
import type { Item } from './conversation.ts';
import { planBatches } from './plan-batches.ts';
import type { PlannedBatch } from './plan-batches.ts';
import { runJudge } from './run-judge.ts';
import type { Verdicts } from './run-judge.ts';
import { runWriter } from './run-writer.ts';
import type { BatchMessage, Usage, WriterCandidate } from './run-writer.ts';

// One run: every sample replays the whole conversation through the writer in batches, gates each
// candidate with the code checks, applies what passes, then asks the judge to grade the result.
const { values } = parseArgs({
  options: {
    effort: { default: 'low', type: 'string' },
    model: { default: 'claude-haiku-5-5', type: 'string' },
    out: { type: 'string' },
    samples: { default: '3', type: 'string' },
    size: { type: 'string' },
  },
});
if (values.out === undefined) {
  throw new Error('--out <dir> is required');
}
const token = process.env['CLAUDE_CODE_OAUTH_TOKEN'];
if (token === undefined || token === '') {
  throw new Error('CLAUDE_CODE_OAUTH_TOKEN is not set');
}

const plan = planBatches(
  conversation.turns,
  values.size === undefined
    ? { count: 4, idleMinutes: 5, maxAgeMinutes: 20 }
    : { size: Number(values.size) },
);
const cwd = mkdtempSync(join(tmpdir(), 'memory-batch-model-'));
mkdirSync(values.out, { recursive: true });
const writerOptions = { cwd, effort: values.effort, model: values.model, token };

try {
  const samples = await Promise.all(
    Array.from({ length: Number(values.samples) }, (_, index) => runSample(index)),
  );
  writeFileSync(
    join(values.out, 'run.json'),
    `${JSON.stringify({ model: values.model, effort: values.effort, plan, samples }, null, 2)}\n`,
  );
  console.log(`wrote ${join(values.out, 'run.json')}`);
} finally {
  rmSync(cwd, { force: true, recursive: true });
}

interface StoredItem {
  active: boolean;
  id: string;
  versions: string[];
}

interface GatedCandidate extends WriterCandidate {
  batch: number;
  index: number;
  outcome: 'applied' | 'no-op' | 'proposal';
  reason: string | null;
}

interface BatchRecord {
  apiMs: number;
  candidates: number;
  error: string | null;
  model: string | null;
  plan: PlannedBatch;
  reportedUSD: number;
  retried: boolean;
  usage: Usage;
  wallMs: number;
}

async function runSample(sample: number): Promise<{
  batches: BatchRecord[];
  candidates: GatedCandidate[];
  history: StoredItem[];
  judge: Verdicts;
  sample: number;
}> {
  const store = new Map<string, StoredItem>(
    conversation.seed.map((item) => [item.id, { active: true, id: item.id, versions: [item.text] }]),
  );
  const batches: BatchRecord[] = [];
  const gated: GatedCandidate[] = [];
  let created = 0;

  for (const [batchIndex, batch] of plan.entries()) {
    const messages = buildBatchMessages(batch);
    const items: Item[] = [...store.values()]
      .filter((item) => item.active)
      .map((item) => ({ id: item.id, text: item.versions.at(-1)! }));
    let result = await runWriter(items, messages, { ...writerOptions, feedback: null });
    let retried = false;
    const clash = findClash(result.candidates);
    if (clash !== null) {
      retried = true;
      const first = result;
      result = await runWriter(items, messages, {
        ...writerOptions,
        feedback: `2 candidates change item ${clash}; change each item at most once.`,
      });
      result = {
        ...result,
        apiMs: first.apiMs + result.apiMs,
        reportedUSD: first.reportedUSD + result.reportedUSD,
        usage: addUsage(first.usage, result.usage),
        wallMs: first.wallMs + result.wallMs,
      };
    }
    batches.push({
      apiMs: result.apiMs,
      candidates: result.candidates.length,
      error: result.error,
      model: result.model,
      plan: batch,
      reportedUSD: result.reportedUSD,
      retried,
      usage: result.usage,
      wallMs: result.wallMs,
    });
    const touched = new Set<string>();
    for (const candidate of result.candidates) {
      const verdict = gateCandidate(candidate, batch, store, touched);
      const record: GatedCandidate = {
        ...candidate,
        batch: batchIndex,
        index: gated.length,
        outcome: verdict.outcome,
        reason: verdict.reason,
      };
      gated.push(record);
      if (verdict.outcome !== 'applied') {
        continue;
      }
      if (candidate.op === 'remember') {
        created += 1;
        const id = `n${created}`;
        store.set(id, { active: true, id, versions: [candidate.text!] });
      } else {
        const item = store.get(candidate.itemID!)!;
        touched.add(item.id);
        if (candidate.op === 'revise') {
          item.versions.push(candidate.text!);
        } else {
          item.active = false;
        }
      }
    }
  }

  const history = [...store.values()];
  const judge = await runJudge(conversation, buildJudgeInput(gated), {
    cwd,
    token: writerOptions.token,
  });
  console.log(`sample ${sample}: ${gated.length} candidates, ${batches.length} batches`);
  return { batches, candidates: gated, history, judge, sample };
}

// Turn i holds the owner message with record ID 2i+1 and its reply with record ID 2i+2.
function buildBatchMessages(batch: PlannedBatch): BatchMessage[] {
  const messages: BatchMessage[] = [];
  for (let index = batch.start; index < batch.end; index += 1) {
    const turn = conversation.turns[index]!;
    messages.push({ id: index * 2 + 1, role: 'owner', shown: turn.owner });
    messages.push({ id: index * 2 + 2, role: 'assistant', shown: turn.reply });
  }
  return messages;
}

function findClash(candidates: WriterCandidate[]): string | null {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.op === 'remember' || candidate.itemID === null) {
      continue;
    }
    if (seen.has(candidate.itemID)) {
      return candidate.itemID;
    }
    seen.add(candidate.itemID);
  }
  return null;
}

function addUsage(left: Usage, right: Usage): Usage {
  return {
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
    input: left.input + right.input,
    output: left.output + right.output,
  };
}

// The host's side of the gate, without the checker model: the source must be an owner message in
// the batch, a revise or retire must name an active item, an exact repeat is a no-op, and the quote
// and token checks from the checks spike decide between applying and proposing.
function gateCandidate(
  candidate: WriterCandidate,
  batch: PlannedBatch,
  store: Map<string, StoredItem>,
  touched: Set<string>,
): { outcome: GatedCandidate['outcome']; reason: string | null } {
  const turnIndex = (candidate.sourceID - 1) / 2;
  if (!Number.isInteger(turnIndex) || turnIndex < batch.start || turnIndex >= batch.end) {
    return { outcome: 'proposal', reason: 'quote outside the batch' };
  }
  if (candidate.op !== 'remember') {
    const item = candidate.itemID === null ? undefined : store.get(candidate.itemID);
    if (item === undefined || !item.active || touched.has(item.id)) {
      return { outcome: 'proposal', reason: 'ambiguous target' };
    }
  }
  if (candidate.op !== 'retire' && (candidate.text === null || candidate.text.trim() === '')) {
    return { outcome: 'proposal', reason: 'no text' };
  }
  if (
    candidate.op !== 'retire' &&
    [...store.values()].some((item) => item.active && item.versions.at(-1) === candidate.text)
  ) {
    return { outcome: 'no-op', reason: 'exact repeat of an active item' };
  }
  const message = buildOwnerMessage(conversation.turns[turnIndex]!.owner);
  const verdict =
    candidate.op === 'retire'
      ? checkQuote(message, candidate.quote)
      : checkWrite(message, { memory: candidate.text!, quote: candidate.quote });
  return verdict.ok
    ? { outcome: 'applied', reason: null }
    : { outcome: 'proposal', reason: verdict.reason };
}

// Strips the ⟦ ⟧ markers and records the text between them as a pasted span.
function buildOwnerMessage(shown: string): OwnerMessage {
  const spans: Span[] = [];
  let text = '';
  let pasted = false;
  let spanStart = 0;
  for (const char of shown) {
    if (char === '⟦' || char === '⟧') {
      if (text.length > spanStart) {
        spans.push({ end: text.length, source: pasted ? 'pasted' : 'typed', start: spanStart });
      }
      pasted = char === '⟦';
      spanStart = text.length;
    } else {
      text += char;
    }
  }
  if (text.length > spanStart) {
    spans.push({ end: text.length, source: pasted ? 'pasted' : 'typed', start: spanStart });
  }
  return { spans, text };
}
