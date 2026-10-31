// oxlint-disable no-await-in-loop -- each step of the run waits on the one before it
// Runs both scenarios in one test imp on the saved imp host: a long turn with token rotations
// mid-turn, and parallel tool calls over HTTP MCP. Serves nixie's stub tools on this machine through
// a reverse forward, writes every event to results/<scenario>.jsonl, and removes the imp and its
// secret on exit. Env: CLAUDE_CODE_OAUTH_TOKEN (the model token, stored only in impd), SPIKE_WORK
// (scratch directory), NIXIE_MODEL (default claude-haiku-5-5), SPIKE_RESTORE_MS (how long the junk
// value stays after the 6th call's result, default 1000).
import { appendFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createToolServer } from './create-tool-server';
import type { ToolCall } from './create-tool-server';

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
const results = join(here, 'results');
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
let proxy: ReturnType<typeof Bun.spawn> | null = null;

try {
  await prepareBox();
  proxy = Bun.spawn(['impz', 'proxy', box, '--reverse', `${guestToolsPort}:${server.port}`], {
    stdout: Bun.file(join(work, 'proxy.log')),
    stderr: Bun.file(join(work, 'proxy-error.log')),
  });
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
  proxy?.kill();
  await proxy?.exited;
  await server.stop(true);
  if (state.madeBox) {
    await runImp(['rm', box]);
  }
  if (state.madeSecret) {
    await runImp(['secret', 'rm', secret]);
  }
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
  if (request.headers.get('authorization') !== `Bearer ${toolsToken}`) {
    return Promise.resolve(new Response('unauthorized', { status: 401 }));
  }
  if (new URL(request.url).pathname === '/ready') {
    return Promise.resolve(new Response('ready'));
  }
  return handler.fetch(request);
}

// The rotation scenario forces each kind of rotation at a fixed tool call. Every other call only
// waits.
async function handleCall(call: ToolCall): Promise<void> {
  if (state.scenario !== 'rotation') {
    return;
  }
  if (call.count === 2) {
    // The CLI sends its next model request as soon as this call's result arrives, so 300 ms after
    // the result the request is in flight: run 1 measured about 950 ms from result to stream end.
    const resultMs = call.input.seconds * 1000;
    pending.push(
      Bun.sleep(resultMs + 300).then(() => rotate('valid', 'same value, model request in flight')),
    );
  } else if (call.count === 4) {
    await rotate('junk', 'between model requests');
    await probeBroker('junk value live');
    await rotate('valid', 'between model requests');
    await probeBroker('valid value back');
  } else if (call.count === 6) {
    await rotate('junk', 'across the next model request');
    const restoreMs = call.input.seconds * 1000 + restoreAfterResultMs;
    pending.push(
      Bun.sleep(restoreMs).then(() =>
        rotate('valid', `restore ${restoreAfterResultMs} ms after the result`),
      ),
    );
  }
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
  for (const file of ['package.json', 'bun.lock', 'turn.ts']) {
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
      scenario,
    ],
    { stdout: 'pipe', stderr: Bun.file(join(work, `${scenario}-stderr.log`)) },
  );
  let buffered = '';
  for await (const chunk of child.stdout.pipeThrough(new TextDecoderStream())) {
    buffered += chunk;
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    for (const line of lines.filter((entry) => entry.trim() !== '')) {
      recordGuestLine(line);
    }
  }
  record('host', 'exited', { code: await child.exited });
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
