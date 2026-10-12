// Drives headless Claude Code (`claude -p`) for one task, with the task's SDK state in a directory
// of its own, the way the conversation guest sets HOME and CLAUDE_CONFIG_DIR.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const model = 'claude-haiku-4-5-20251001';

const budgetPerCall = '0.30';
const budgetTotal = 3;
let spent = 0;

export function getSpent(): number {
  return spent;
}

export interface Task {
  // the task's reserved state directory, which holds HOME, CLAUDE_CONFIG_DIR and the working folder
  readonly dir: string;
  readonly systemPrompt: string;

  // TMPDIR for the CLI, or undefined to leave the CLI on the system default
  readonly tmp: string | undefined;
}

export function createTask(dir: string, systemPrompt: string, tmp: string | undefined): Task {
  mkdirSync(join(dir, 'home', 'work'), { recursive: true });
  if (tmp !== undefined) {
    mkdirSync(tmp, { recursive: true });
  }
  return { dir, systemPrompt, tmp };
}

export interface Resume {
  readonly sessionID: string;

  // the boundary to resume at, or undefined for a plain resume
  readonly messageID?: string;
  readonly fork: boolean;
}

export function startTurn(
  task: Task,
  prompt: string,
  resume?: Resume,
  extraEnv: Record<string, string> = {},
): Bun.Subprocess<Blob | 'ignore', 'pipe', 'pipe'> {
  if (spent > budgetTotal) {
    throw new Error(`spent $${spent.toFixed(3)}, over the run's budget`);
  }

  // Linux caps one argument at 128 KiB, so a long prompt goes through stdin
  const long = prompt.length > 100_000;
  const args = buildArgs(task, long ? '' : prompt, resume).filter((arg, index) => !long || index !== 2);
  return Bun.spawn(args, {
    cwd: join(task.dir, 'home', 'work'),
    env: { ...buildEnv(task), ...extraEnv },
    stdin: long ? new Blob([prompt]) : 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function buildArgs(task: Task, prompt: string, resume: Resume | undefined): string[] {
  const args = [
    'claude',
    '-p',
    prompt,
    '--model',
    model,
    '--tools',
    '',
    '--system-prompt',
    task.systemPrompt,
    '--setting-sources',
    '',
    '--output-format',
    'json',
    '--max-budget-usd',
    budgetPerCall,
  ];
  if (resume !== undefined) {
    args.push('--resume', resume.sessionID);
    if (resume.messageID !== undefined) {
      args.push('--resume-session-at', resume.messageID);
    }
    if (resume.fork) {
      args.push('--fork-session');
    }
  }
  return args;
}

function buildEnv(task: Task): Record<string, string> {
  const home = join(task.dir, 'home');
  return {
    PATH: process.env['PATH'] ?? '',
    HOME: home,
    CLAUDE_CONFIG_DIR: join(home, '.claude'),
    CLAUDE_CODE_OAUTH_TOKEN: process.env['CLAUDE_CODE_OAUTH_TOKEN'] ?? '',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    DISABLE_AUTOUPDATER: '1',
    ...(task.tmp === undefined ? {} : { TMPDIR: task.tmp }),
  };
}

export interface TurnResult {
  readonly sessionID: string;
  readonly text: string;
  readonly costUSD: number;

  // every input token the call sent, cached or not
  readonly inputTokens: number;
  readonly ms: number;
}

interface PrintResult {
  session_id: string;
  result: string;
  is_error: boolean;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}

export async function runTurn(
  task: Task,
  prompt: string,
  resume?: Resume,
  extraEnv: Record<string, string> = {},
): Promise<TurnResult> {
  const started = performance.now();
  const child = startTurn(task, prompt, resume, extraEnv);
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await child.exited;
  const ms = Math.round(performance.now() - started);
  let parsed: PrintResult;
  try {
    parsed = JSON.parse(out) as PrintResult;
  } catch {
    throw new Error(`claude -p gave no JSON (exit ${child.exitCode}): ${err.slice(0, 300)}`);
  }
  spent += parsed.total_cost_usd;
  if (parsed.is_error) {
    throw new Error(`claude -p failed: ${parsed.result.slice(0, 300)}`);
  }
  const { usage } = parsed;
  return {
    sessionID: parsed.session_id,
    text: parsed.result,
    costUSD: parsed.total_cost_usd,
    inputTokens:
      usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
    ms,
  };
}

export interface Entry {
  type: string;
  uuid?: string;
  isSidechain?: boolean;
  isCompactSummary?: boolean;
  subtype?: string;
  message?: { role: string; content: string | { type: string; text?: string }[] };
}

export function findTranscript(task: Task, sessionID: string): string | undefined {
  const projects = join(task.dir, 'home', '.claude', 'projects');
  for (const project of existsSync(projects) ? readdirSync(projects) : []) {
    const path = join(projects, project, `${sessionID}.jsonl`);
    if (existsSync(path)) {
      return path;
    }
  }
  return undefined;
}

export function loadTranscript(task: Task, sessionID: string): Entry[] {
  const path = findTranscript(task, sessionID);
  if (path === undefined) {
    return [];
  }
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Entry);
}

export function getEntryText(entry: Entry): string {
  const content = entry.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  return (content ?? []).map((block) => block.text ?? '').join('');
}

// the session's last main-chain message, which a step commit records as the task's boundary
export function findBoundary(entries: Entry[]): string {
  const last = entries.findLast(
    (entry) =>
      (entry.type === 'assistant' || entry.type === 'user') &&
      entry.uuid !== undefined &&
      entry.isSidechain !== true,
  );
  if (last?.uuid === undefined) {
    throw new Error('the transcript has no chain entry');
  }
  return last.uuid;
}

// the readable summary that a compaction wrote, which nixie copies into the event log
export function findCompactSummary(entries: Entry[]): string | undefined {
  const summary = entries.findLast((entry) => entry.isCompactSummary === true);
  return summary === undefined ? undefined : getEntryText(summary);
}
