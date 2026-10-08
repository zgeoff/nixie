/* oxlint-disable max-lines -- one spike runner; splitting needs a new module */
// Runs the agent evals: memory writing from a transcript, and a scripted day with tools.
// Usage: env -u ANTHROPIC_API_KEY bun --env-file=../../.env agent/run.ts --out results/<name>
//   [--task memory|day|all] [--memory-case <dir>] [--configs a,b] [--samples n] [--jobs n]
import { once } from 'node:events';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type {
  EffortLevel,
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { buildOptions, readFlag } from '../options.ts';

interface Config {
  effort?: EffortLevel;
  harness: 'codex' | 'sdk';
  model?: string;
  profile?: string;
}

interface Turn {
  label: string;
  text: string;
}

interface Job {
  config: string;
  fail: string;
  sample: number;
  seed: string | undefined;
  system: string;
  task: string;
  transcript: string;
  turns: Turn[];
  variant: string;
}

interface JobKey {
  config: string;
  sample: number;
  task: string;
  transcript: string;
  variant: string;
}

interface Slot {
  config: string;
  sample: number;
  transcripts: string[];
}

interface Session {
  events: EventTarget;
  index: number;
  job: Job;
  started: number;
}

interface CodexEvent {
  item?: { text?: string; type?: string };
  thread_id?: string;
  type?: string;
  usage?: { output_tokens?: number };
}

interface CodexOutput {
  exitCode: number | null;
  stderr: string;
  stdout: string;
}

interface CodexSession {
  dir: string;
  fakeHome: string;
  home: string;
  results: TurnResult[];
  thread: string | undefined;
  total: number;
}

interface CodexTurn {
  began: number;
  captured: CodexOutput;
  parsed: CodexEvent[];
  turn: Turn;
}

interface Outcome {
  error: string | undefined;
  turns: TurnResult[];
}

interface JobRun {
  dir: string;
  job: Job;
  started: number;
}

interface TurnResult {
  durationMs: number;
  endMs: number;
  error?: string;
  label: string;
  outputTokens: number;
  prompt: string;
  reply: string;
  startMs: number;
}

const CONFIGS: Record<string, Config> = {
    'glm-default': { harness: 'sdk', profile: 'glm' },
    'glm-low': { effort: 'low', harness: 'sdk', profile: 'glm' },
    'glm-flash-default': { harness: 'sdk', model: 'glm-5.3-flash', profile: 'glm' },
    'glm-flash-low': { effort: 'low', harness: 'sdk', model: 'glm-5.3-flash', profile: 'glm' },
    'haiku-low': { effort: 'low', harness: 'sdk', model: 'claude-haiku-5-5' },
    'luna-low': { effort: 'low', harness: 'codex', model: 'gpt-6-luna' },
    'muse-low': { effort: 'low', harness: 'sdk', profile: 'muse' },
  },
  QUIET_FEATURES = [
    'apps',
    'browser_use',
    'browser_use_external',
    'computer_use',
    'goals',
    'hooks',
    'image_generation',
    'in_app_browser',
    'multi_agent',
    'plugin_sharing',
    'plugins',
    'realtime_conversation',
    'remote_plugin',
    'shell_snapshot',
    'shell_tool',
    'skill_mcp_dependency_install',
    'skill_search',
    'sleep_tool',
    'tool_suggest',
    'unified_exec',
    'view_image',
    'workspace_dependencies',
    'worktrees',
  ],
  TOOL_NAMES = [
    'memory_search',
    'memory_write',
    'memory_update',
    'reminder_create',
    'calendar_list',
    'calendar_create',
    'message_draft',
    'web_search',
  ],
  agentDir = import.meta.dir,
  caseDir = resolve(readFlag(process.argv, '--memory-case') ?? join(agentDir, 'memory/example'));

function readTurns(path: string): Turn[] {
  return readFileSync(path, 'utf8')
    .split(/^## /mu)
    .slice(1)
    .map((section) => {
      const [label = '', ...body] = section.split('\n');
      return { label: label.trim(), text: body.join('\n').trim() };
    });
}

function buildMemoryJob(slot: Slot, variant: string, file: string): Job {
  const text = readFileSync(join(caseDir, 'transcripts', file), 'utf8');
  return {
    config: slot.config,
    fail: '',
    sample: slot.sample,
    seed: join(caseDir, 'seed.json'),
    system: readFileSync(join(agentDir, `memory/${variant}.md`), 'utf8'),
    task: 'memory',
    transcript: basename(file, '.md'),
    turns: [
      {
        label: 'Write memory',
        text: `Here is today's conversation. Update the owner's memory.\n\n<transcript>\n${text}\n</transcript>`,
      },
    ],
    variant,
  };
}

function buildDayJob(slot: Slot): Job {
  return {
    config: slot.config,
    fail: 'calendar_create:1,calendar_create:2,reminder_create:2,reminder_create:3',
    sample: slot.sample,
    seed: undefined,
    system: readFileSync(join(agentDir, 'day/persona.md'), 'utf8'),
    task: 'day',
    transcript: '',
    turns: readTurns(join(agentDir, 'day/script.md')),
    variant: 'default',
  };
}

function buildSlotJobs(task: string, slot: Slot): Job[] {
  const memory = ['plain', 'strict', 'evidence'].flatMap((variant) =>
    slot.transcripts.map((file) => buildMemoryJob(slot, variant, file)),
  );
  return [
    ...(task === 'memory' || task === 'all' ? memory : []),
    ...(task === 'day' || task === 'all' ? [buildDayJob(slot)] : []),
  ];
}

function buildJobs(task: string, configs: string[], samples: number): Job[] {
  const transcripts = readdirSync(join(caseDir, 'transcripts'))
    .filter((name) => name.endsWith('.md'))
    .toSorted();
  return configs.flatMap((config) =>
    Array.from({ length: samples }, (_, index) => index + 1).flatMap((sample) =>
      buildSlotJobs(task, { config, sample, transcripts }),
    ),
  );
}

function getKey(job: JobKey): string {
  return [job.task, job.config, job.variant, job.transcript, job.sample].join('|');
}

function buildMockEnv(job: Job, dir: string): Record<string, string> {
  return { MOCK_DIR: dir, MOCK_FAIL: job.fail };
}

// Sends one turn, waits for its result, then sends the next, so the session sees a real exchange.
async function* sendTurns(session: Session): AsyncGenerator<SDKUserMessage> {
  if (session.index >= session.job.turns.length) {
    return;
  }
  const answered = once(session.events, 'result'),
    turn = session.job.turns[session.index];
  session.started = Date.now();
  yield {
    message: { content: turn?.text ?? '', role: 'user' },
    parent_tool_use_id: null,
    type: 'user',
  };
  await answered;
  session.index += 1;
  yield* sendTurns(session);
}

function buildTurnResult(session: Session, message: SDKResultMessage): TurnResult {
  const turn = session.job.turns[session.index];
  return {
    durationMs: Date.now() - session.started,
    endMs: Date.now(),
    error: message.subtype === 'success' && !message.is_error ? undefined : message.subtype,
    label: turn?.label ?? '',
    outputTokens: message.usage.output_tokens,
    prompt: turn?.text ?? '',
    reply: message.subtype === 'success' ? message.result : '',
    startMs: session.started,
  };
}

function buildSdkOptions(job: Job, config: Config, dir: string) {
  const base = buildOptions(
    {
      cwd: dir,
      mode: 'replace',
      model: config.model ?? '',
      persona: '',
      profile: config.profile,
      tools: [],
    },
    job.system,
  );
  return {
    ...base,
    allowedTools: TOOL_NAMES.map((name) => `mcp__mock__${name}`),
    effort: config.effort,
    includePartialMessages: false,
    mcpServers: {
      mock: {
        args: [join(agentDir, 'mock-tools.ts')],
        command: 'bun',
        env: buildMockEnv(job, dir),
      },
    },
    stderr: () => {},
    strictMcpConfig: true,
  };
}

// Claude Code path: Haiku on the subscription, GLM and Muse through their profiles and the proxy.
async function runSdk(job: Job, config: Config, dir: string): Promise<TurnResult[]> {
  const options = buildSdkOptions(job, config, dir),
    results: TurnResult[] = [],
    session: Session = { events: new EventTarget(), index: 0, job, started: Date.now() };
  for await (const message of query({
    options,
    prompt: sendTurns(session),
  }) as AsyncIterable<SDKMessage>) {
    if (message.type === 'result') {
      results.push(buildTurnResult(session, message));
      session.events.dispatchEvent(new Event('result'));
    }
  }
  return results;
}

function buildCodexConfig(job: Job, config: Config, dir: string): string {
  const env = buildMockEnv(job, dir);
  return `model = ${JSON.stringify(config.model)}
model_reasoning_effort = ${JSON.stringify(config.effort ?? 'low')}
model_instructions_file = ${JSON.stringify(join(dir, 'system.md'))}
sandbox_mode = "read-only"
approval_policy = "never"
include_environment_context = false
include_permissions_instructions = false
include_apps_instructions = false
include_collaboration_mode_instructions = false
project_doc_max_bytes = 0
web_search = "disabled"

[features]
${QUIET_FEATURES.map((name) => `${name} = false`).join('\n')}

[skills]
include_instructions = false

[skills.bundled]
enabled = false

[agents]
enabled = false

[mcp_servers.mock]
command = "bun"
args = [${JSON.stringify(join(agentDir, 'mock-tools.ts'))}]
env = { MOCK_DIR = ${JSON.stringify(env.MOCK_DIR)}, MOCK_FAIL = ${JSON.stringify(env.MOCK_FAIL)} }
default_tools_approval_mode = "approve"
`;
}

async function runCodexExec(session: CodexSession, turn: Turn): Promise<CodexOutput> {
  const child = Bun.spawn(
      [
        'codex',
        'exec',
        ...(session.thread ? ['resume', session.thread] : []),
        '--strict-config',
        '--skip-git-repo-check',
        '--json',
        turn.text,
      ],
      {
        cwd: session.dir,
        env: { CODEX_HOME: session.home, HOME: session.fakeHome, PATH: process.env.PATH ?? '' },
        stderr: 'pipe',
        stdin: 'ignore',
        stdout: 'pipe',
      },
    ),
    [stdout, stderr] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
  await child.exited;
  return { exitCode: child.exitCode, stderr, stdout };
}

function parseCodexEvents(stdout: string): CodexEvent[] {
  return stdout
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as CodexEvent);
}

function readCodexError(done: CodexTurn): string | undefined {
  const failed = done.parsed.find(
    (event) => event.type === 'turn.failed' || event.type === 'error',
  );
  if (failed) {
    return JSON.stringify(failed);
  }
  return done.captured.exitCode === 0
    ? undefined
    : done.captured.stderr.trim().split('\n').slice(-2).join(' ');
}

function readCodexUsage(session: CodexSession, events: CodexEvent[]): number {
  return events.find((event) => event.usage)?.usage?.output_tokens ?? session.total;
}

function buildCodexResult(session: CodexSession, done: CodexTurn): TurnResult {
  return {
    durationMs: Date.now() - done.began,
    endMs: Date.now(),
    error: readCodexError(done),
    label: done.turn.label,
    outputTokens: readCodexUsage(session, done.parsed) - session.total,
    prompt: done.turn.text,
    reply: done.parsed
      .filter((event) => event.type === 'item.completed' && event.item?.type === 'agent_message')
      .map((event) => event.item?.text)
      .join('\n\n'),
    startMs: done.began,
  };
}

async function runCodexTurn(session: CodexSession, turn: Turn): Promise<void> {
  const began = Date.now(),
    captured = await runCodexExec(session, turn),
    parsed = parseCodexEvents(captured.stdout);
  session.thread ??= parsed.find((event) => event.thread_id)?.thread_id;
  session.results.push(buildCodexResult(session, { began, captured, parsed, turn }));
  session.total = readCodexUsage(session, parsed);
}

async function runCodexTurns(session: CodexSession, turns: Turn[]): Promise<void> {
  const [turn, ...rest] = turns;
  if (turn) {
    await runCodexTurn(session, turn);
    await runCodexTurns(session, rest);
  }
}

// Codex path: one `codex exec` per turn, resuming the same thread, as in codex-converse.ts.
async function runCodex(job: Job, config: Config, dir: string): Promise<TurnResult[]> {
  const fakeHome = mkdtempSync(join(tmpdir(), 'agent-home-')),
    home = mkdtempSync(join(tmpdir(), 'agent-codex-')),
    session: CodexSession = { dir, fakeHome, home, results: [], thread: undefined, total: 0 };
  writeFileSync(join(dir, 'system.md'), job.system);
  writeFileSync(join(home, 'config.toml'), buildCodexConfig(job, config, dir));
  symlinkSync(join(homedir(), '.codex', 'auth.json'), join(home, 'auth.json'));
  try {
    await runCodexTurns(session, job.turns);
  } finally {
    rmSync(home, { force: true, recursive: true });
    rmSync(fakeHome, { force: true, recursive: true });
  }
  return session.results;
}

function readJsonLines(path: string): unknown[] {
  return existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
}

function readMemory(dir: string): unknown {
  const path = join(dir, 'state.json');
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as { memory: unknown }).memory
    : [];
}

function readConfig(job: Job): Config {
  const config = CONFIGS[job.config];
  if (!config) {
    throw new Error(`unknown config ${job.config}`);
  }
  return config;
}

async function runHarness(job: Job, config: Config, dir: string): Promise<Outcome> {
  try {
    const turns =
      config.harness === 'codex'
        ? await runCodex(job, config, dir)
        : await runSdk(job, config, dir);
    return { error: undefined, turns };
  } catch (error) {
    return { error: (error as Error).message, turns: [] };
  }
}

function buildRow(run: JobRun, outcome: Outcome) {
  return {
    calls: readJsonLines(join(run.dir, 'calls.jsonl')),
    config: run.job.config,
    durationMs: Date.now() - run.started,
    error: outcome.error ?? outcome.turns.find((turn) => turn.error)?.error,
    memory: readMemory(run.dir),
    sample: run.job.sample,
    task: run.job.task,
    transcript: run.job.transcript,
    turns: outcome.turns,
    variant: run.job.variant,
  };
}

async function writeRow(run: JobRun, config: Config, outFile: string): Promise<void> {
  const outcome = await runHarness(run.job, config, run.dir),
    row = buildRow(run, outcome);
  appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  console.log(
    `${getKey(run.job)} ${row.error ? `FAIL ${row.error}` : 'ok'} ${(row.durationMs / 1000).toFixed(0)}s calls=${row.calls.length}`,
  );
}

async function runJob(job: Job, outFile: string): Promise<void> {
  const config = readConfig(job),
    dir = mkdtempSync(join(tmpdir(), 'agent-run-')),
    started = Date.now();
  if (job.seed) {
    copyFileSync(job.seed, join(dir, 'seed.json'));
  }
  await writeRow({ dir, job, started }, config, outFile);
  rmSync(dir, { force: true, recursive: true });
}

async function runWorker(queue: Job[], outFile: string): Promise<void> {
  const job = queue.shift();
  if (job) {
    await runJob(job, outFile);
    await runWorker(queue, outFile);
  }
}

function readOutFile(argv: string[]): string {
  const out = readFlag(argv, '--out');
  if (!out) {
    throw new Error('--out <dir> is required');
  }
  mkdirSync(out, { recursive: true });
  return join(out, 'runs.jsonl');
}

function planJobs(argv: string[], outFile: string): Job[] {
  const configs = (readFlag(argv, '--configs') ?? Object.keys(CONFIGS).join(',')).split(','),
    done = new Set(readJsonLines(outFile).map((row) => getKey(row as JobKey))),
    jobs = buildJobs(
      readFlag(argv, '--task') ?? 'all',
      configs,
      Number(readFlag(argv, '--samples') ?? '1'),
    );

  // Interleave configs so slow models do not all queue at the end.
  return jobs
    .filter((job) => !done.has(getKey(job)))
    .toSorted(
      (a, b) =>
        a.sample - b.sample ||
        a.transcript.localeCompare(b.transcript) ||
        a.variant.localeCompare(b.variant),
    );
}

async function runAll(argv: string[]): Promise<void> {
  const file = readOutFile(argv),
    jobCount = Number(readFlag(argv, '--jobs') ?? '4'),
    jobs = planJobs(argv, file);
  console.log(`${jobs.length} runs, ${jobCount} at a time`);
  await Promise.all(Array.from({ length: jobCount }, () => runWorker(jobs, file)));
}

await runAll(process.argv.slice(2));
