// Runs the account-pick eval: each case sends one owner message to `claude -p`, with one mock
// connector tool whose `connection` argument names the accounts in the way that the arm picks.
// Usage: bun run.ts --out results/<name> [--configs a,b] [--arms a,b]
//   [--samples n] [--jobs n]
// It appends one JSON line per run to <out>/results.jsonl and skips runs the file already holds.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface Case {
  expect: string | null;
  id: string;
  kind: string;
  prompt: string;
  set: string;
}

interface Cases {
  cases: Case[];
  owner: string;
  sets: Record<string, { tool: string }>;
}

interface Job {
  arm: string;
  config: string;
  item: Case;
  sample: number;
}

const CONFIGS: Record<string, { effort: string; model: string }> = {
    'haiku-low': { effort: 'low', model: 'claude-haiku-5-5' },
    'opus-low': { effort: 'low', model: 'claude-opus-5-5' },
    'sonnet-low': { effort: 'low', model: 'claude-sonnet-5-5' },
  },
  here = import.meta.dir,
  casesPath = join(here, 'cases.json'),
  cases = JSON.parse(readFileSync(casesPath, 'utf8')) as Cases,
  argv = process.argv,
  out = resolve(readFlag(argv, '--out') ?? 'results/account'),
  resultsPath = join(out, 'results.jsonl'),
  configs = (readFlag(argv, '--configs') ?? 'haiku-low').split(','),
  arms = (readFlag(argv, '--arms') ?? 'id-label,id-only,id-tool-desc,label').split(','),
  samples = Number(readFlag(argv, '--samples') ?? '1'),
  jobs = Number(readFlag(argv, '--jobs') ?? '6'),
  systemPrompt = [
    `You are the personal assistant of ${cases.owner}. Act through your tools.`,
    `When a request does not make clear which of ${cases.owner}'s accounts to use, ask which one before you act.`,
    'Today is 2026-10-15.',
  ].join(' ');

mkdirSync(out, { recursive: true });
const done = collectDoneKeys(),
  queue = planJobs().filter((job) => !done.has(buildKey(job)));
console.log(`${queue.length} runs to do, ${done.size} already done`);
await Promise.all(Array.from({ length: jobs }, () => drainQueue()));

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function collectDoneKeys(): Set<string> {
  if (!existsSync(resultsPath)) {
    return new Set();
  }
  return new Set(
    readFileSync(resultsPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const row = JSON.parse(line) as { arm: string; case: string; config: string; sample: number };
        return [row.config, row.arm, row.case, row.sample].join('|');
      }),
  );
}

function planJobs(): Job[] {
  const planned: Job[] = [];
  for (let sample = 1; sample <= samples; sample += 1) {
    for (const config of configs) {
      for (const arm of arms) {
        for (const item of cases.cases) {
          planned.push({ arm, config, item, sample });
        }
      }
    }
  }
  return planned;
}

function buildKey(job: Job): string {
  return [job.config, job.arm, job.item.id, job.sample].join('|');
}

async function drainQueue(): Promise<void> {
  for (let job = queue.shift(); job; job = queue.shift()) {
    const row = await runJob(job);
    appendFileSync(resultsPath, `${JSON.stringify(row)}\n`);
    console.log(`${buildKey(job)} ${row.calls.length} calls ${row.error ?? ''}`);
  }
}

async function runJob(job: Job): Promise<Record<string, unknown> & { calls: unknown[]; error?: string }> {
  const config = CONFIGS[job.config];
  if (!config) {
    throw new Error(`no config ${job.config}`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'account-eval-')),
    log = join(dir, 'calls.jsonl'),
    tool = cases.sets[job.item.set]?.tool ?? '',
    mcpPath = join(dir, 'mcp.json');
  mkdirSync(join(dir, 'cwd'));
  writeFileSync(
    mcpPath,
    JSON.stringify({
      mcpServers: {
        acct: {
          args: [join(here, 'connector.ts')],
          command: 'bun',
          env: {
            ACCOUNT_ARM: job.arm,
            ACCOUNT_CASES: casesPath,
            ACCOUNT_LOG: log,
            ACCOUNT_SET: job.item.set,
          },
        },
      },
    }),
  );
  const started = Date.now(),
    output = await runClaude(
      [
        '-p',
        job.item.prompt,
        '--model',
        config.model,
        '--effort',
        config.effort,
        '--system-prompt',
        systemPrompt,
        '--tools',
        '',
        '--mcp-config',
        mcpPath,
        '--strict-mcp-config',
        '--no-session-persistence',
        '--max-turns',
        '4',
        '--output-format',
        'json',
        '--allowedTools',
        `mcp__acct__${tool}`,
      ],
      join(dir, 'cwd'),
    ),
    calls = existsSync(log)
      ? readFileSync(log, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as unknown)
      : [];
  rmSync(dir, { force: true, recursive: true });
  const base = {
    arm: job.arm,
    calls,
    case: job.item.id,
    config: job.config,
    durationMs: Date.now() - started,
    sample: job.sample,
  };
  try {
    const parsed = JSON.parse(output.stdout) as {
      is_error?: boolean;
      num_turns?: number;
      result?: string;
      total_cost_usd?: number;
    };
    return {
      ...base,
      costUSD: parsed.total_cost_usd ?? 0,
      ...(parsed.is_error ? { error: 'result error' } : {}),
      reply: parsed.result ?? '',
      turns: parsed.num_turns ?? 0,
    };
  } catch {
    return {
      ...base,
      costUSD: 0,
      error: `exit ${output.code}: ${output.stderr.slice(0, 300)}`,
      reply: '',
    };
  }
}

async function runClaude(
  args: string[],
  cwd: string,
): Promise<{ code: number | null; stderr: string; stdout: string }> {
  const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }),
    timer = setTimeout(() => child.kill('SIGKILL'), 180_000);
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const [code] = (await once(child, 'close')) as [number | null];
  clearTimeout(timer);
  return { code, stderr, stdout };
}
