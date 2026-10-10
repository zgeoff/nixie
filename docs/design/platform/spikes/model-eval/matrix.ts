// Sends every prompt once to every model under every persona and appends each reply to a JSONL file.
// Usage: env -u ANTHROPIC_API_KEY bun --no-env-file matrix.ts --out results/<run_name>
//   [--models <a,b>] [--personas <a,b>] [--prompts <a,b>] [--jobs <count>] [--profile <name>]
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Settings } from './options.ts';
import { buildOptions, readFlag } from './options.ts';

interface Cell {
  model: string;
  persona: string;
  prompt: string;
}

interface Run {
  cells: Cell[];
  outFile: string;
  profile: string | undefined;
  prompts: Map<string, string>;
}

interface Row extends Cell {
  costUsd: number | undefined;
  durationMs: number;
  error: string | undefined;
  outputTokens: number | undefined;
  reply: string;
  reportedModel: string | undefined;
}

const DEFAULT_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-4-5-20251001'],
  here = import.meta.dir;

function readList(argv: string[], name: string, all: string[]): string[] {
  return readFlag(argv, name)?.split(',').filter(Boolean) ?? all;
}

// Splits prompts.md on its `##` headings into a map from prompt id to prompt text.
function readPrompts(): Map<string, string> {
  const sections = readFileSync(join(here, 'prompts.md'), 'utf8').split(/^## /mu).slice(1);
  return new Map(
    sections.map((section) => {
      const [id = '', ...body] = section.split('\n');
      return [id.trim(), body.join('\n').trim().replaceAll('\n', ' ')];
    }),
  );
}

function getKey(cell: Cell): string {
  return `${cell.model}|${cell.persona}|${cell.prompt}`;
}

function readDone(outFile: string): Set<string> {
  if (!existsSync(outFile)) {
    return new Set();
  }
  const rows = readFileSync(outFile, 'utf8').split('\n').filter(Boolean);
  return new Set(rows.map((line) => getKey(JSON.parse(line) as Row)));
}

function findPersonas(): string[] {
  return readdirSync(join(here, 'personas'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => basename(file, '.md'));
}

function buildCells(argv: string[], prompts: Map<string, string>): Cell[] {
  return readList(argv, '--models', DEFAULT_MODELS).flatMap((model) =>
    readList(argv, '--personas', findPersonas()).flatMap((persona) =>
      readList(argv, '--prompts', [...prompts.keys()]).map((prompt) => ({
        model,
        persona,
        prompt,
      })),
    ),
  );
}

function getOutFile(argv: string[]): string {
  const out = readFlag(argv, '--out');
  if (!out) {
    throw new Error('--out <dir> is required');
  }
  mkdirSync(out, { recursive: true });
  return join(out, 'results.jsonl');
}

// Skips the cells that the output file already holds, so a stopped run picks up where it ended.
function planRun(argv: string[], outFile: string): Run {
  const done = readDone(outFile),
    prompts = readPrompts();
  return {
    cells: buildCells(argv, prompts).filter((cell) => !done.has(getKey(cell))),
    outFile,
    profile: readFlag(argv, '--profile'),
    prompts,
  };
}

function readRow(row: Row, message: SDKMessage): void {
  if (message.type === 'system' && message.subtype === 'init') {
    row.reportedModel = message.model;
  } else if (message.type === 'result') {
    row.costUsd = message.total_cost_usd;
    row.outputTokens = message.usage.output_tokens;
    if (message.subtype === 'success' && !message.is_error) {
      row.reply = message.result;
    } else {
      row.error = message.subtype === 'success' ? message.result : message.subtype;
    }
  }
}

async function runCell(plan: Run, cell: Cell): Promise<Row> {
  const cwd = mkdtempSync(join(tmpdir(), 'model-eval-')),
    row: Row = {
      ...cell,
      costUsd: undefined,
      durationMs: 0,
      error: undefined,
      outputTokens: undefined,
      reply: '',
      reportedModel: undefined,
    },
    settings: Settings = {
      cwd,
      mode: 'replace',
      model: cell.model,
      persona: join(here, 'personas', `${cell.persona}.md`),
      profile: plan.profile,
      tools: [],
    },
    started = Date.now();
  try {
    const options = {
      ...buildOptions(settings, readFileSync(settings.persona, 'utf8')),
      includePartialMessages: false,
    };
    for await (const message of query({ options, prompt: plan.prompts.get(cell.prompt) ?? '' })) {
      readRow(row, message);
    }
  } catch (error) {
    row.error = (error as Error).message;
  } finally {
    rmSync(cwd, { force: true, recursive: true });
  }
  row.durationMs = Date.now() - started;
  return row;
}

function writeRow(plan: Run, row: Row): void {
  const status = row.error ? `FAIL ${row.error.slice(0, 200)}` : 'ok';
  appendFileSync(plan.outFile, `${JSON.stringify(row)}\n`);
  console.log(`${(row.durationMs / 1000).toFixed(1)}s ${getKey(row)} ${status}`);
}

// Takes cells off the shared queue one at a time until the queue is empty.
async function runWorker(plan: Run, queue: Cell[]): Promise<void> {
  const cell = queue.shift();
  if (cell) {
    const row = await runCell(plan, cell);
    writeRow(plan, row);
    await runWorker(plan, queue);
  }
}

async function run(argv: string[]): Promise<void> {
  const jobs = Number(readFlag(argv, '--jobs') ?? '4'),
    plan = planRun(argv, getOutFile(argv)),
    queue = [...plan.cells];
  console.log(`${plan.cells.length} cells to run, ${jobs} at a time, into ${plan.outFile}`);
  await Promise.all(Array.from({ length: jobs }, () => runWorker(plan, queue)));
}

await run(process.argv.slice(2));
