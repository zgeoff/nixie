// oxlint-disable no-await-in-loop -- each step of the run waits on the one before it
// Runs both scenarios in one test imp on the saved imp host: a long turn with token rotations
// mid-turn, and parallel tool calls over HTTP MCP. Serves nixie's stub tools on this machine through
// a reverse forward, writes every event to results/<scenario>.jsonl, and removes the imp and its
// secret on exit. Env: CLAUDE_CODE_OAUTH_TOKEN (the model token, stored only in impd), SPIKE_WORK
// (scratch directory), NIXIE_MODEL (default claude-haiku-5-5), SPIKE_RESTORE_MS (how long the junk
// value stays after the 6th call's result, default 1000), SPIKE_RESULTS (the results directory,
// default results/ beside this file).
import { appendFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { match } from 'ts-pattern';
import { createToolServer } from './create-tool-server';
import type { ToolCall } from './create-tool-server';
import { isToolsRequestAuthorized } from './is-tools-request-authorized';
import { planRotation } from './plan-rotation';
import type { RotationStep } from './plan-rotation';
import { removeEachResource } from './remove-each-resource';

const box = 'nixie-spike-load';
const secret = 'nixie-spike-load-model';
const guestToolsPort = 8901;
const junkValue = 'nixie-spike-not-a-token';
const secretBinding = [
  '--kind',
  'custom',
  '--hosts',
  'api.anthropic.com',
  '--header',
  'authorization',
  '--scheme',
  'bearer',
];
const modelToken = readEnv('CLAUDE_CODE_OAUTH_TOKEN');
const work = readEnv('SPIKE_WORK');
const model = process.env.NIXIE_MODEL ?? 'claude-haiku-5-5';
const restoreAfterResultMs = Number(process.env.SPIKE_RESTORE_MS ?? '1000');
const here = import.meta.dir;
const results = process.env.SPIKE_RESULTS ?? join(here, 'results');
const toolsToken = crypto.randomUUID();
const started = performance.now();
const pending: Promise<void>[] = [];
const state = { scenario: 'setup', madeBox: false, madeSecret: false };

await refuseExistingNames();
rmSync(results, { recursive: true, force: true });
mkdirSync(results, { recursive: true });
mkdirSync(work, { recursive: true });

const handler = createMcpHandler(() =>
  createToolServer({ onCall: handleCall, onEvent: (event, fields) => record('tools', event, fields) }),
);
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: answerRequest,
  idleTimeout: 0,
});
const children = new Set<Bun.Subprocess>();
const teardown: { running: Promise<void> | null } = { running: null };

// Bun skips a pending finally block when a signal ends the process, so a signal runs the same
// teardown first.
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  process.once(signal, () => {
    void removeRunResourcesOnce()
      .catch((error: unknown) => console.error(String(error)))
      .finally(() => process.exit(code));
  });
}

try {
  await prepareBox();
  children.add(
    Bun.spawn(['impz', 'proxy', box, '--reverse', `${guestToolsPort}:${server.port}`], {
      stdout: Bun.file(join(work, 'proxy.log')),
      stderr: Bun.file(join(work, 'proxy-error.log')),
    }),
  );
  await waitForGuestRoute();
  await probeBroker('before the first turn');
  for (const scenario of ['rotation', 'parallel'] as const) {
    state.scenario = scenario;
    await runTurn(scenario);
    await Promise.all(pending.splice(0));
  }
  state.scenario = 'after';
  writeResult('audit.txt', await runImp(['audit', box]));
  writeResult('grants.txt', await runImp(['grants', box]));
  console.log(`token check: ${hasTokenLeak() ? 'the token is in a results file' : 'clean'}`);
} finally {
  await removeRunResourcesOnce();
}

function removeRunResourcesOnce(): Promise<void> {
  teardown.running ??= removeRunResources();
  return teardown.running;
}

async function removeRunResources(): Promise<void> {
  for (const child of children) {
    child.kill();
  }
  await Promise.allSettled([...children].map((child) => child.exited));
  await server.stop(true);
  await removeMadeResources();
}

// A rotation still running would store the secret again, so it ends before the removals start.
async function removeMadeResources(): Promise<void> {
  await Promise.allSettled(pending.splice(0));
  await removeEachResource([
    ...(state.madeBox ? [() => runImp(['rm', box])] : []),
    ...(state.madeSecret ? [() => runImp(['secret', 'rm', secret])] : []),
  ]);
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`set ${name}`);
  }
  return value;
}

async function refuseExistingNames(): Promise<void> {
  const boxes = await runImp(['ls']);
  const secrets = await runImp(['secret', 'ls']);
  if (boxes.split('\n').some((line) => line.startsWith(`${box} `))) {
    throw new Error(`the imp ${box} exists; remove it first`);
  }
  if (secrets.split('\n').some((line) => line.startsWith(`${secret} `))) {
    throw new Error(`the secret ${secret} exists; remove it first`);
  }
}

async function runImp(args: string[], input?: string): Promise<string> {
  const child = Bun.spawn(['impz', ...args], {
    stdin: input === undefined ? 'ignore' : new TextEncoder().encode(input),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`impz ${args.slice(0, 2).join(' ')} exited ${code}: ${error.trim()}`);
  }
  return output;
}

function record(source: string, event: string, fields: Record<string, unknown> = {}): void {
  const line = { at: Math.round(performance.now() - started), source, event, ...fields };
  appendFileSync(join(results, `${state.scenario}.jsonl`), `${JSON.stringify(line)}\n`);
  console.log(JSON.stringify(line).slice(0, 220));
}

function answerRequest(request: Request): Promise<Response> {
  if (!isToolsRequestAuthorized(request.headers.get('authorization'), toolsToken)) {
    return Promise.resolve(new Response('unauthorized', { status: 401 }));
  }
  if (new URL(request.url).pathname === '/ready') {
    return Promise.resolve(new Response('ready'));
  }
  return handler.fetch(request);
}

async function handleCall(call: ToolCall): Promise<void> {
  if (state.scenario !== 'rotation') {
    return;
  }
  const steps = planRotation({ count: call.count, seconds: call.input.seconds }, restoreAfterResultMs);
  for (const step of steps) {
    await runRotationStep(step);
  }
}

async function runRotationStep(step: RotationStep): Promise<void> {
  await match(step)
    .with({ kind: 'rotate' }, (now) => rotate(now.value, now.reason))
    .with({ kind: 'rotate-later' }, (later) => {
      pending.push(Bun.sleep(later.delayMs).then(() => rotate(later.value, later.reason)));
    })
    .with({ kind: 'probe' }, (probe) => probeBroker(probe.reason))
    .exhaustive();
}

async function rotate(value: 'valid' | 'junk', reason: string): Promise<void> {
  record('rotation', 'start', { value, reason });
  await runImp(
    ['secret', 'add', secret, ...secretBinding, '--replace'],
    value === 'valid' ? modelToken : junkValue,
  );
  record('rotation', 'done', { value, reason });
}

async function probeBroker(reason: string): Promise<void> {
  const status = await runImp([
    'exec',
    '--require',
    'broker',
    box,
    '--',
    'curl',
    '-s',
    '-o',
    '/dev/null',
    '-w',
    '%{http_code}',
    '-H',
    'anthropic-version: 2023-06-01',
    '-H',
    'anthropic-beta: oauth-2025-04-20',
    '-H',
    'authorization: Bearer nixie-broker-placeholder',
    'https://api.anthropic.com/v1/models',
  ]);
  record('probe', 'models', { reason, status: Number(status) });
}

async function prepareBox(): Promise<void> {
  await runImp(['new', box, '--image', 'base', '--memory', '2g', '--no-backup', '--policy', 'public']);
  state.madeBox = true;
  record('setup', 'created', { image: 'base' });
  const stage = join(work, 'stage', 'app');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  for (const file of [
    'package.json',
    'bun.lock',
    'turn.ts',
    'build-message-event.ts',
    'pick-turn-exit-code.ts',
  ]) {
    cpSync(join(here, file), join(stage, file));
  }
  await runImp(['cp', process.execPath, `${box}:/usr/local/bin/bun`]);
  await runImp(['cp', stage, `${box}:/`]);
  await runImp(['exec', box, '--', 'sh', '-c', 'cd /app && bun install --frozen-lockfile']);
  record('setup', 'installed');

  // nixie's conversation imp runs with egress none, and the broker still reaches the model host.
  await runImp(['policy', box, 'none']);
  await runImp(['secret', 'add', secret, ...secretBinding], modelToken);
  state.madeSecret = true;
  await runImp(['grant', box, secret]);
  record('setup', 'granted', { policy: 'none' });
}

async function waitForGuestRoute(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const status = await runImp([
      'exec',
      box,
      '--',
      'curl',
      '-s',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      '-H',
      `authorization: Bearer ${toolsToken}`,
      `http://127.0.0.1:${guestToolsPort}/ready`,
    ]).catch(() => '000');
    if (status === '200') {
      record('setup', 'route ready');
      return;
    }
    await Bun.sleep(500);
  }
  throw new Error('the reverse forward never reached the tool server');
}

async function runTurn(scenario: 'rotation' | 'parallel'): Promise<void> {
  record('host', 'exec', { scenario });
  const child = Bun.spawn(
    [
      'impz',
      'exec',
      '--require',
      'broker',
      box,
      '--',
      'env',
      `SPIKE_TOOLS_URL=http://127.0.0.1:${guestToolsPort}/mcp`,
      `SPIKE_TOOLS_TOKEN=${toolsToken}`,
      `NIXIE_MODEL=${model}`,
      'bun',
      '/app/turn.ts',
      '--scenario',
      scenario,
    ],
    { stdout: 'pipe', stderr: Bun.file(join(work, `${scenario}-stderr.log`)) },
  );
  children.add(child);
  let buffered = '';
  for await (const chunk of child.stdout.pipeThrough(new TextDecoderStream())) {
    buffered += chunk;
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    for (const line of lines.filter((entry) => entry.trim() !== '')) {
      recordGuestLine(line);
    }
  }
  const code = await child.exited;
  children.delete(child);
  record('host', 'exited', { code });
  if (code !== 0) {
    throw new Error(`the ${scenario} turn's impz exec exited ${code}; see ${scenario}-stderr.log`);
  }
}

function recordGuestLine(line: string): void {
  try {
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed === 'object' && parsed !== null && 'event' in parsed) {
      const { event, ...fields } = parsed;
      record('guest', String(event), fields);
      return;
    }
  } catch {
    // a line that is not JSON is recorded as text below
  }
  record('guest', 'text', { line });
}

function writeResult(name: string, text: string): void {
  appendFileSync(join(results, name), text);
}

function hasTokenLeak(): boolean {
  const directories = [results, work];
  return directories.some((directory) =>
    readdirSync(directory, { recursive: true, withFileTypes: true }).some(
      (entry) =>
        entry.isFile() &&
        readFileSync(join(entry.parentPath, entry.name), 'utf8').includes(modelToken),
    ),
  );
}
