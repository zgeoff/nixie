// Runs a scenario through headless `codex exec` with the persona as the base instructions.
// Each conversation has its own CODEX_HOME and HOME, so no user config, skills, or AGENTS.md load.
// Usage: bun codex-converse.ts --out <dir> --scenario <dir> [--samples n] [--model id] [--effort e]
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { readFlag } from './options.ts';

interface Script {
  label: string;
  text: string;
}

interface Plan {
  effort: string;
  model: string;
  outFile: string;
  personaFile: string;
  script: Script[];
}

interface Conversation {
  dirs: string[];
  env: Record<string, string>;
  persona: string;
  outputTotal: number;
  plan: Plan;
  thread: string | undefined;
}

interface Reply {
  durationMs: number;
  error: string | undefined;
  outputTokens: number;
  reply: string;
  thread: string | undefined;
  toolItems: string[];
}

interface CodexEvent {
  item?: { message?: string; text?: string; type: string };
  thread_id?: string;
  type: string;
  usage?: { output_tokens: number };
}

// Codex reports these items itself when a feature is off; they are not tool calls by the model.
const NOTICE_ITEMS = new Set(['agent_message', 'error', 'reasoning']),
  QUIET_FEATURES = [
    'apps',
    'browser_use',
    'browser_use_external',
    'code_mode_host',
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
  ];

function readScript(dir: string): Script[] {
  const sections = readFileSync(join(dir, 'script.md'), 'utf8').split(/^## /mu).slice(1);
  return sections.map((section) => {
    const [label = '', ...body] = section.split('\n');
    return { label: label.trim(), text: body.join('\n').trim() };
  });
}

function buildConfig(plan: Plan): string {
  const features = QUIET_FEATURES.map((name) => `${name} = false`).join('\n');
  return `model = ${JSON.stringify(plan.model)}
model_reasoning_effort = ${JSON.stringify(plan.effort)}
model_instructions_file = ${JSON.stringify(plan.personaFile)}
sandbox_mode = "read-only"
approval_policy = "never"
include_environment_context = false
include_permissions_instructions = false
include_apps_instructions = false
include_collaboration_mode_instructions = false
project_doc_max_bytes = 0
web_search = "disabled"

[features]
${features}

[skills]
include_instructions = false

[skills.bundled]
enabled = false

[agents]
enabled = false
`;
}

function createConversation(plan: Plan, persona: string): Conversation {
  const codexHome = mkdtempSync(join(tmpdir(), 'model-eval-codex-')),
    fakeHome = mkdtempSync(join(tmpdir(), 'model-eval-home-')),
    workDir = mkdtempSync(join(tmpdir(), 'model-eval-'));
  appendFileSync(join(codexHome, 'config.toml'), buildConfig(plan));
  symlinkSync(join(homedir(), '.codex', 'auth.json'), join(codexHome, 'auth.json'));
  return {
    dirs: [codexHome, fakeHome, workDir],
    env: { CODEX_HOME: codexHome, HOME: fakeHome, PATH: process.env.PATH ?? '' },
    outputTotal: 0,
    persona,
    plan,
    thread: undefined,
  };
}

function parseEvents(stdout: string): Reply {
  const events = stdout
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as CodexEvent),
    failed = events.find((event) => event.type === 'turn.failed' || event.type === 'error'),
    items = events.flatMap((event) =>
      event.type === 'item.completed' && event.item ? [event.item] : [],
    );
  return {
    durationMs: 0,
    error: failed ? JSON.stringify(failed) : undefined,
    outputTokens: events.find((event) => event.usage)?.usage?.output_tokens ?? 0,
    reply: items
      .filter((item) => item.type === 'agent_message')
      .map((item) => item.text ?? '')
      .join('\n\n'),
    thread: events.find((event) => event.thread_id)?.thread_id,
    toolItems: items.filter((item) => !NOTICE_ITEMS.has(item.type)).map((item) => item.type),
  };
}

function startCodex(
  conversation: Conversation,
  text: string,
): Bun.Subprocess<'ignore', 'pipe', 'pipe'> {
  const resume = conversation.thread ? ['resume', conversation.thread] : [];
  return Bun.spawn(
    ['codex', 'exec', ...resume, '--strict-config', '--skip-git-repo-check', '--json', text],
    {
      cwd: conversation.dirs[2],
      env: conversation.env,
      stderr: 'pipe',
      stdin: 'ignore',
      stdout: 'pipe',
    },
  );
}

async function sendTurn(conversation: Conversation, text: string): Promise<Reply> {
  const begin = Date.now(),
    child = startCodex(conversation, text),
    output = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]),
    reply = parseEvents(output[0]);
  await child.exited;
  reply.durationMs = Date.now() - begin;
  if (child.exitCode !== 0 && !reply.error) {
    reply.error = output[1].trim().split('\n').slice(-3).join(' ');
  }
  return reply;
}

// A resumed session reports the session's running output total, so a row takes the difference.
async function writeTurn(
  conversation: Conversation,
  index: number,
  current: Script,
): Promise<void> {
  const result = await sendTurn(conversation, current.text),
    row = {
      model: conversation.plan.model,
      persona: conversation.persona,
      durationMs: result.durationMs,
      error: result.error,
      outputTokens: result.outputTokens - conversation.outputTotal,
      prompt: `${String(index + 1).padStart(2, '0')} ${current.label}`,
      promptText: current.text,
      reply: result.reply,
      toolItems: result.toolItems,
    };
  conversation.thread ??= result.thread;
  conversation.outputTotal = result.outputTokens;
  appendFileSync(conversation.plan.outFile, `${JSON.stringify(row)}\n`);
  console.log(
    `${conversation.persona} ${row.prompt} ${result.error ? `FAIL ${result.error}` : 'ok'}`,
  );
}

async function runTurns(conversation: Conversation, index: number): Promise<void> {
  const current = conversation.plan.script[index];
  if (current) {
    await writeTurn(conversation, index, current);
    await runTurns(conversation, index + 1);
  }
}

async function runConversation(plan: Plan, persona: string): Promise<void> {
  const conversation = createConversation(plan, persona);
  try {
    await runTurns(conversation, 0);
  } finally {
    for (const dir of conversation.dirs) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
}

async function runWorker(plan: Plan, queue: string[]): Promise<void> {
  const persona = queue.shift();
  if (persona) {
    await runConversation(plan, persona);
    await runWorker(plan, queue);
  }
}

function planRun(argv: string[]): Plan {
  const out = readFlag(argv, '--out'),
    scenario = readFlag(argv, '--scenario');
  if (!out || !scenario) {
    throw new Error('--out <dir> and --scenario <dir> are required');
  }
  mkdirSync(out, { recursive: true });
  return {
    effort: readFlag(argv, '--effort') ?? 'low',
    model: readFlag(argv, '--model') ?? 'gpt-6-luna',
    outFile: join(out, 'results.jsonl'),
    personaFile: join(resolve(scenario), 'persona.md'),
    script: readScript(scenario),
  };
}

async function run(argv: string[]): Promise<void> {
  const jobs = Number(readFlag(argv, '--jobs') ?? '2'),
    name = basename(resolve(readFlag(argv, '--scenario') ?? '')),
    plan = planRun(argv),
    queue = Array.from(
      { length: Number(readFlag(argv, '--samples') ?? '1') },
      (_, index) => `${name}#${index + 1}`,
    );
  console.log(`${queue.length} conversations of ${plan.script.length} turns on ${plan.model}`);
  await Promise.all(Array.from({ length: jobs }, () => runWorker(plan, queue)));
}

await run(process.argv.slice(2));
