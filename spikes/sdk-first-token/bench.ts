// Times Agent SDK turns from the prompt to init, the model request, the first text token, and the
// result, under 6 ways of starting a turn, and appends one JSON line per turn.
// Usage: bench.ts --out <file> [--samples 10] [--models a,b] [--modes cold,resume] [--no-thinking]
import { once } from 'node:events';
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname } from 'node:path';
import type {
  Options,
  Query,
  SDKMessage,
  SDKUserMessage,
  SpareProcess,
} from '@anthropic-ai/claude-agent-sdk';
import { prewarm, query, startup } from '@anthropic-ai/claude-agent-sdk';
import { buildOptions, noThinking, prompts, scratch } from './setup.ts';
import type { Turn } from './turn.ts';
import { readTurn } from './turn.ts';

interface Cell {
  mode: Mode;
  model: string;
  sample: number;
  tools: number;
}

interface ClaimTarget {
  cwd: string;
  model: string;
}

// A prompt queue that stays open until closed, so one process serves several turns.
interface Stream {
  closed: boolean;
  events: EventTarget;
  queue: SDKUserMessage[];
}

type Mode = 'cold' | 'fresh' | 'prewarm' | 'resume' | 'startup' | 'stream';

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function readOne(q: Query, t0: number): Promise<Turn> {
  try {
    return await readTurn(q[Symbol.asyncIterator](), () => t0, { text: '' });
  } finally {
    q.close();
  }
}

function runResume(options: Options, sessionId: string | undefined): Promise<Turn> {
  const t0 = performance.now();
  return readOne(
    query({ options: { ...options, resume: sessionId }, prompt: prompts[1] ?? '' }),
    t0,
  );
}

// fresh: cold, with a config folder of its own. cold: a new query() and subprocess for the first
// turn of a session. resume: a new query() and subprocess that resumes that session for turn 2.
function runColdResume(model: string, withTools: boolean, mode: Mode): Promise<Turn[]> {
  return runSession(buildOptions(model, withTools, mode === 'fresh'), mode === 'resume');
}

async function runSession(options: Options, resume: boolean): Promise<Turn[]> {
  const first = await readOne(query({ options, prompt: prompts[0] ?? '' }), performance.now());
  return resume ? [await runResume(options, first.sessionId)] : [first];
}

async function* sendQueued(stream: Stream): AsyncGenerator<SDKUserMessage> {
  const next = stream.queue.shift();
  if (next) {
    yield next;
  } else if (stream.closed) {
    return;
  } else {
    await once(stream.events, 'push');
  }
  yield* sendQueued(stream);
}

function sendPrompt(stream: Stream, text: string): void {
  stream.queue.push({
    message: { content: text, role: 'user' },
    parent_tool_use_id: null,
    type: 'user',
  });
  stream.events.dispatchEvent(new Event('push'));
}

// The clock starts as the prompt joins the queue that the SDK reads.
function runStreamTurn(
  messages: AsyncIterator<SDKMessage>,
  stream: Stream,
  text: string,
): Promise<Turn> {
  const sentAt = performance.now();
  sendPrompt(stream, text);
  return readTurn(messages, () => sentAt, { text: '' });
}

// Sends each prompt once the previous turn's result is in, as a live conversation would.
async function readStreamTurns(
  messages: AsyncIterator<SDKMessage>,
  stream: Stream,
  turns: Turn[],
): Promise<Turn[]> {
  if (turns.length >= prompts.length) {
    return turns;
  }
  const turn = await runStreamTurn(messages, stream, prompts[turns.length] ?? '');
  return readStreamTurns(messages, stream, [...turns, turn]);
}

// stream: one query() with a prompt stream; turns 2 and 3 reach a process that is already up.
async function runStream(model: string, withTools: boolean): Promise<Turn[]> {
  const input: Stream = { closed: false, events: new EventTarget(), queue: [] },
    session = query({ options: buildOptions(model, withTools), prompt: sendQueued(input) });
  try {
    return await readStreamTurns(session[Symbol.asyncIterator](), input, []);
  } finally {
    input.closed = true;
    input.events.dispatchEvent(new Event('push'));
    session.close();
  }
}

// startup: startup() spawns the process ahead of the turn; the clock starts at warm.query().
async function runStartup(model: string, withTools: boolean): Promise<Turn[]> {
  const warm = await startup({ options: buildOptions(model, withTools) });
  await Bun.sleep(500);
  return [await readOne(warm.query(prompts[0] ?? ''), performance.now())];
}

async function waitClaim(spare: SpareProcess): Promise<void> {
  try {
    await spare.claimed;
  } catch (error) {
    console.error(`claim refused: ${String(error)}`);
  }
}

// The clock starts at claim(), which binds the spare to a folder and sends the prompt.
async function runClaim(spare: SpareProcess, options: ClaimTarget): Promise<Turn[]> {
  const claimStart = performance.now(),
    claimed = spare.claim({ options, prompt: prompts[0] ?? '' }),
    refusal = waitClaim(spare),
    turn = await readOne(claimed, claimStart);
  await refusal;
  return [turn];
}

// prewarm: a parked spare with host-level options; the clock starts at claim().
async function runPrewarm(model: string, withTools: boolean): Promise<Turn[]> {
  const { cwd, model: _model, ...hostOptions } = buildOptions(model, withTools),
    spare = await prewarm({ options: hostOptions });
  await Bun.sleep(500);
  return runClaim(spare, { cwd: cwd ?? scratch, model });
}

const models = (
    readFlag('--models') ?? 'claude-haiku-4-5-20251001,claude-haiku-5-5,claude-sonnet-5-5'
  ).split(','),
  modes = (readFlag('--modes')?.split(',') ?? [
    'fresh',
    'cold',
    'resume',
    'stream',
    'startup',
    'prewarm',
  ]) as Mode[],
  out = readFlag('--out') ?? 'results/run.jsonl',
  runners: Record<Mode, (model: string, withTools: boolean) => Promise<Turn[]>> = {
    cold: (model, withTools) => runColdResume(model, withTools, 'cold'),
    fresh: (model, withTools) => runColdResume(model, withTools, 'fresh'),
    prewarm: runPrewarm,
    resume: (model, withTools) => runColdResume(model, withTools, 'resume'),
    startup: runStartup,
    stream: runStream,
  },
  samples = Number(readFlag('--samples') ?? '10'),
  toolCounts = (readFlag('--tools') ?? '0,3').split(',').map(Number);

// Each row holds the host's 1-minute load average, to spot turns slowed by other work.
function writeTurns(cell: Cell, turns: Turn[]): void {
  for (const [index, turn] of turns.entries()) {
    const row = {
      ...cell,
      load: loadavg()[0],
      thinking: noThinking ? 'disabled' : 'default',
      turnIndex: index + (cell.mode === 'resume' ? 1 : 0),
      ...turn,
    };
    appendFileSync(out, `${JSON.stringify(row)}\n`);
    console.log(
      `${cell.sample} ${cell.model} tools=${cell.tools} ${cell.mode}#${row.turnIndex} init=${turn.init?.toFixed(0)} req=${turn.requesting?.toFixed(0)} text=${turn.firstText?.toFixed(0)} result=${turn.result?.toFixed(0)} limit=${turn.rateLimitStatus}`,
    );
  }
}

async function runCells(cells: Cell[]): Promise<void> {
  const [cell, ...rest] = cells;
  if (!cell) {
    return;
  }
  try {
    const turns = await runners[cell.mode](cell.model, cell.tools > 0);
    writeTurns(cell, turns);
  } catch (error) {
    appendFileSync(out, `${JSON.stringify({ ...cell, error: String(error) })}\n`);
    console.error(
      `${cell.sample} ${cell.model} tools=${cell.tools} ${cell.mode} error ${String(error)}`,
    );
  }
  await runCells(rest);
}

// Samples go round-robin across the cells, so drift over the run spreads evenly.
function planCells(): Cell[] {
  return Array.from({ length: samples }, (_, sample) =>
    models.flatMap((model) =>
      toolCounts.flatMap((tools) => modes.map((mode) => ({ mode, model, sample, tools }))),
    ),
  ).flat();
}

mkdirSync(dirname(out), { recursive: true });
try {
  // One unrecorded turn fills the shared config folder, as a long-lived install would have it.
  await runColdResume(models[0] ?? '', false, 'cold');
  await runCells(planCells());
} finally {
  // A closed process writes its transcript during the SDK's 2 s exit grace, so wait it out.
  await Bun.sleep(3000);
  rmSync(scratch, { force: true, recursive: true });
}
