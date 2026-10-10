// The host-side driver: every time comes from the host clock, around imp CLI calls and the arrival
// of turn.ts's lines. Usage: bun bench.ts <cli|lifecycle|wake|sdk|e2e-new|e2e-wake> [samples].
// run.sh sets its env; each sample goes to results/<phase>.jsonl.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// oxlint-disable no-await-in-loop, sort-vars -- samples run one at a time, in timed order

interface Line {
  at: number;
  data: Record<string, unknown>;
}

interface RunResult {
  code: number;
  lines: Line[];
  stderr: string;
  totalMs: number;
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`set ${name}`);
  }
  return value;
}

function readElapsed(origin: number): number {
  return Math.round(performance.now() - origin);
}

// The imp CLI never sees the model token.
function buildImpEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'CLAUDE_CODE_OAUTH_TOKEN') {
      env[key] = value;
    }
  }
  return env;
}

function parseLine(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { text };
  }
}

// Stamps each stdout line on arrival, relative to `origin`, and parses JSON lines.
async function collectLines(stream: ReadableStream<Uint8Array>, origin: number): Promise<Line[]> {
  const decoder = new TextDecoder(),
    lines: Line[] = [];
  let buffer = '';
  for await (const chunk of stream) {
    const at = readElapsed(origin),
      parts = (buffer + decoder.decode(chunk, { stream: true })).split('\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      lines.push({ at, data: parseLine(part) });
    }
  }
  return lines;
}

async function run(command: string[], origin: number, env = buildImpEnv()): Promise<RunResult> {
  const child = Bun.spawn(command, { env, stderr: 'pipe', stdout: 'pipe' }),
    lines = await collectLines(child.stdout, origin),
    code = await child.exited,
    stderr = await new Response(child.stderr).text();
  return { code, lines, stderr: stderr.slice(-2000), totalMs: readElapsed(origin) };
}

async function runImp(args: string[]): Promise<number> {
  const result = await run(['imp', ...args], performance.now());
  if (result.code !== 0) {
    throw new Error(`imp ${args.join(' ')} exited ${result.code}: ${result.stderr}`);
  }
  return result.totalMs;
}

function writeSample(phase: string, sample: Record<string, unknown>): void {
  mkdirSync('results', { recursive: true });
  appendFileSync(join('results', `${phase}.jsonl`), `${JSON.stringify(sample)}\n`);
  console.log(`${phase} ${JSON.stringify(sample)}`);
}

// Each milestone holds turn.ts's guest-side ms from query() and the host's arrival ms.
function collectMilestones(result: RunResult): Record<string, unknown> {
  const out: Record<string, unknown> = { code: result.code, totalMs: result.totalMs };
  for (const line of result.lines) {
    const event = line.data.event;
    if (typeof event === 'string') {
      out[event] = { arrivedMs: line.at, ...line.data };
    }
  }
  if (result.code !== 0) {
    out.stderr = result.stderr;
  }
  return out;
}

function buildImpTurnCommand(box: string, tools: number): string[] {
  const vars = [
    'NIXIE_PLACEMENT=imp',
    `NIXIE_TOOLS=${tools}`,
    `NIXIE_MCP_URL=${readEnv('NIXIE_MCP_URL')}`,
    `NIXIE_MCP_TOKEN=${readEnv('NIXIE_MCP_TOKEN')}`,
    `NIXIE_MODEL=${readEnv('NIXIE_MODEL')}`,
  ].join(' ');
  return [
    'imp',
    'exec',
    '--require',
    'broker',
    box,
    '--',
    'sh',
    '-c',
    `cd /app && ${vars} exec bun turn.ts`,
  ];
}

// Host turns share one HOME across samples, as the imp's /root is shared across its turns.
function runHostTurn(tools: number, origin: number): Promise<RunResult> {
  const env: Record<string, string> = {
    CLAUDE_CODE_OAUTH_TOKEN: readEnv('CLAUDE_CODE_OAUTH_TOKEN'),
    HOME: readEnv('SPIKE_HOME'),
    NIXIE_MCP_TOKEN: readEnv('NIXIE_MCP_TOKEN'),
    NIXIE_MCP_URL: readEnv('NIXIE_MCP_URL'),
    NIXIE_MODEL: readEnv('NIXIE_MODEL'),
    NIXIE_PLACEMENT: 'host',
    NIXIE_TOOLS: String(tools),
    PATH: readEnv('PATH'),
  };
  return run(['bun', 'turn.ts'], origin, env);
}

function buildCreateArgs(name: string): string[] {
  const image = readEnv('SPIKE_TEMPLATE'),
    allow = readEnv('SPIKE_ALLOW');
  return ['new', name, '--image', image, '--memory', '2g', '--policy', 'box', '--allow', allow];
}

// Sleeps the imp, then lets the snapshot settle, so the next timed step starts from a sleeping imp.
async function runSleep(box: string): Promise<number> {
  const ms = await runImp(['sleep', box]);
  await Bun.sleep(2000);
  return ms;
}

async function runLifecycle(samples: number): Promise<void> {
  for (let index = 0; index < samples; index += 1) {
    const name = `nixie-spike-c${index}`,
      origin = performance.now(),
      newMs = await runImp(buildCreateArgs(name)),
      execMs = await runImp(['exec', name, '--', 'true']),
      toAnswerMs = readElapsed(origin),
      grantMs = await runImp(['grant', name, readEnv('SPIKE_SECRET')]);

    // SPIKE_TAG files warm-up creates apart.
    writeSample(process.env.SPIKE_TAG ?? 'lifecycle', { execMs, grantMs, newMs, toAnswerMs });
    await runImp(['rm', name]);
  }
}

async function runWake(samples: number): Promise<void> {
  const box = readEnv('SPIKE_BOX');
  for (let index = 0; index < samples; index += 1) {
    const sleepMs = await runSleep(box),
      origin = performance.now(),
      wakeMs = await runImp(['wake', box]),
      execMs = await runImp(['exec', box, '--', 'true']);
    writeSample('wake', { execMs, sleepMs, toAnswerMs: readElapsed(origin), wakeMs });

    // A few seconds awake keeps the guest from being young at the next sleep.
    await runImp(['exec', box, '--', 'sh', '-c', 'sleep 3']);
  }
}

async function runSdkSample(placement: string, box: string, tools: number): Promise<void> {
  const origin = performance.now(),
    result =
      placement === 'host'
        ? await runHostTurn(tools, origin)
        : await run(buildImpTurnCommand(box, tools), origin);
  writeSample('sdk', { placement, tools, ...collectMilestones(result) });
}

// The same turn on the host and in the awake imp, round-robin over tool counts.
async function runSdk(samples: number): Promise<void> {
  const box = readEnv('SPIKE_BOX');
  for (let index = 0; index < samples; index += 1) {
    for (const tools of [0, 1, 3]) {
      for (const placement of ['host', 'imp']) {
        await runSdkSample(placement, box, tools);
      }
    }
  }
}

// A new imp from the prepared image to the first text of a turn with 3 tools.
async function runE2eNew(samples: number): Promise<void> {
  for (let index = 0; index < samples; index += 1) {
    const name = `nixie-spike-e${index}`,
      origin = performance.now(),
      newMs = await runImp(buildCreateArgs(name)),
      grantMs = await runImp(['grant', name, readEnv('SPIKE_SECRET')]),
      turn = await run(buildImpTurnCommand(name, 3), origin);
    writeSample('e2e-new', { grantMs, newMs, ...collectMilestones(turn) });
    await runImp(['rm', name]);
  }
}

// A sleeping imp to the first text of a turn with 3 tools; the exec wakes it.
async function runE2eWake(samples: number): Promise<void> {
  const box = readEnv('SPIKE_BOX');
  for (let index = 0; index < samples; index += 1) {
    const sleepMs = await runSleep(box),
      turn = await run(buildImpTurnCommand(box, 3), performance.now());
    writeSample('e2e-wake', { sleepMs, ...collectMilestones(turn) });
  }
}

async function runCli(samples: number): Promise<void> {
  for (let index = 0; index < samples; index += 1) {
    writeSample('cli', { lsMs: await runImp(['ls']) });
  }
}

const [phase = '', samplesText = '10'] = process.argv.slice(2),
  phases: Record<string, (samples: number) => Promise<void>> = {
    cli: runCli,
    'e2e-new': runE2eNew,
    'e2e-wake': runE2eWake,
    lifecycle: runLifecycle,
    sdk: runSdk,
    wake: runWake,
  },
  runPhase = phases[phase];
if (!runPhase) {
  throw new Error(`unknown phase ${phase}; one of ${Object.keys(phases).join(', ')}`);
}
await runPhase(Number(samplesText));
