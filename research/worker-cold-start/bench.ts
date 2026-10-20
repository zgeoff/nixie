// The driver: every time comes from this machine's clock, around docker CLI calls and the arrival of
// each container's output. Usage: bun bench.ts <start|turn|fetch> [samples]. run.sh sets its env;
// each sample goes to results/<phase>.jsonl.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// @boundaries-ignore a spike imports the code it measures
import { decodeFetchReply, encodeFetchMessage, encodeFrame } from '../../libs/wire/src';
// @boundaries-ignore a spike imports the code it measures
import type { FetchRequest } from '../../libs/wire/src';

// oxlint-disable no-await-in-loop -- samples run one at a time, in timed order

interface Line {
  at: number;
  data: Record<string, unknown>;
}

interface RunResult {
  code: number;

  // when the last byte of the first whole frame arrived, or undefined when none did
  frameMs: number | undefined;
  lines: Line[];
  stdout: Uint8Array;
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

function parseLine(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { text };
  }
}

// Stamps each stdout line on arrival, relative to `origin`, and keeps the raw bytes for frames. It
// also stamps the arrival of the first whole frame: a 4-byte length, then that many bytes.
async function readStreamOutput(
  stream: ReadableStream<Uint8Array>,
  origin: number,
): Promise<{ frameMs: number | undefined; lines: Line[]; stdout: Uint8Array }> {
  const decoder = new TextDecoder();
  const lines: Line[] = [];
  const chunks: Uint8Array[] = [];
  let buffer = '';
  let frameMs: number | undefined;
  for await (const chunk of stream) {
    const at = readElapsed(origin);
    const parts = (buffer + decoder.decode(chunk, { stream: true })).split('\n');
    chunks.push(chunk);
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      lines.push({ at, data: parseLine(part) });
    }
    if (frameMs === undefined && hasWholeFrame(Buffer.concat(chunks))) {
      frameMs = at;
    }
  }
  return { frameMs, lines, stdout: Buffer.concat(chunks) };
}

function hasWholeFrame(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes.length >= 4 + bytes.readUInt32BE(0);
}

async function run(command: string[], origin: number, input?: Uint8Array): Promise<RunResult> {
  const child = Bun.spawn(command, {
    stderr: 'pipe',
    stdin: input ? 'pipe' : 'ignore',
    stdout: 'pipe',
  });
  const output = readStreamOutput(child.stdout, origin);
  if (input && child.stdin) {
    child.stdin.write(input);
    await child.stdin.end();
  }
  const { frameMs, lines, stdout } = await output;
  const code = await child.exited;
  const stderr = await new Response(child.stderr).text();
  return {
    code,
    frameMs,
    lines,
    stderr: stderr.slice(-2000),
    stdout,
    totalMs: readElapsed(origin),
  };
}

// Empties the page cache, so the next run reads the image and every binary from disk.
async function removePageCache(): Promise<void> {
  await Bun.spawn(['sync']).exited;
  writeFileSync('/proc/sys/vm/drop_caches', '3');
  await Bun.sleep(500);
}

async function setupMode(mode: string): Promise<void> {
  if (mode === 'cold') {
    await removePageCache();
  }
}

function writeSample(phase: string, sample: Record<string, unknown>): void {
  mkdirSync('results', { recursive: true });
  appendFileSync(join('results', `${phase}.jsonl`), `${JSON.stringify(sample)}\n`);
  console.log(`${phase} ${JSON.stringify(sample)}`);
}

// Cold runs alternate which image goes first, so neither always follows the other's reads.
function pickOrder<T>(items: T[], index: number): T[] {
  return index % 2 === 0 ? items : items.toReversed();
}

// Docker's own cost: a new container that runs `true`, cold and warm.
async function runStart(samples: number): Promise<void> {
  const images = [...readEnv('SPIKE_IMAGES').split(','), readEnv('SPIKE_FETCH_IMAGE')];
  for (let index = 0; index < samples; index += 1) {
    for (const image of pickOrder(images, index)) {
      for (const mode of ['cold', 'warm']) {
        await setupMode(mode);
        const result = await run(
          ['docker', 'run', '--rm', '--entrypoint', 'true', image],
          performance.now(),
        );
        writeSample('start', { code: result.code, image, mode, totalMs: result.totalMs });
      }
    }
  }
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

// The broker's proxy and CA reach the container by name, as an imp's guest gets them.
function buildTurnCommand(image: string): string[] {
  return [
    'docker',
    'run',
    '--rm',
    '--cpus',
    '2',
    '--memory',
    '1536m',
    '-e',
    'NIXIE_PLACEMENT=imp',
    '-e',
    'NIXIE_TOOLS=0',
    '-e',
    `NIXIE_MODEL=${readEnv('NIXIE_MODEL')}`,
    '-e',
    `HTTPS_PROXY=${readEnv('SPIKE_PROXY')}`,
    '-e',
    'NODE_USE_ENV_PROXY=1',
    '-e',
    'SSL_CERT_FILE=/etc/broker-ca.pem',
    '-e',
    'NODE_EXTRA_CA_CERTS=/etc/broker-ca.pem',
    '-v',
    `${readEnv('SPIKE_CA')}:/etc/broker-ca.pem:ro`,
    image,
    'bun',
    '/app/guests/conversation/spike-turn.ts',
  ];
}

// A fresh container per turn, cold and then warm, for each image.
async function runTurn(samples: number): Promise<void> {
  const images = readEnv('SPIKE_IMAGES').split(',');
  for (let index = 0; index < samples; index += 1) {
    for (const image of pickOrder(images, index)) {
      for (const mode of ['cold', 'warm']) {
        await setupMode(mode);
        const result = await run(buildTurnCommand(image), performance.now());
        writeSample('turn', { image, mode, ...collectMilestones(result) });
      }
    }
  }
}

function buildFetchFrame(): Uint8Array {
  const request: FetchRequest = {
    deniedRanges: [],
    limits: { bodyBytes: 2_000_000, redirects: 5, textBytes: 200_000, timeoutMs: 15_000 },
    url: readEnv('SPIKE_FETCH_URL'),
  };
  return encodeFrame(encodeFetchMessage(request));
}

// The reply is one frame: a 4-byte length, then the JSON.
function formatReply(result: RunResult): string {
  try {
    const reply = decodeFetchReply(result.stdout.subarray(4));
    return reply.kind === 'page' ? `page ${reply.status}` : `${reply.kind}: ${reply.reason}`;
  } catch {
    return `undecoded: ${result.stderr}`;
  }
}

// The fetch sandbox's default limits: 1 vCPU and 512 MiB.
const fetchLimits = ['--cpus', '1', '--memory', '512m', '--memory-swap', '512m'];

// A fresh sandbox per fetch, against one fetcher process per fetch in a long-lived sandbox.
async function runFetch(samples: number): Promise<void> {
  const image = readEnv('SPIKE_FETCH_IMAGE');
  const box = readEnv('SPIKE_FETCH_BOX');
  const frame = buildFetchFrame();
  const commands: Record<string, string[]> = {
    exec: ['docker', 'exec', '-i', box, '/usr/local/bin/bun', '/app/fetch.js'],
    fresh: ['docker', 'run', '-i', '--rm', ...fetchLimits, image],
  };
  for (let index = 0; index < samples; index += 1) {
    for (const route of pickOrder(['fresh', 'exec'], index)) {
      for (const mode of ['cold', 'warm']) {
        await setupMode(mode);
        const result = await run(commands[route] ?? [], performance.now(), frame);
        // frameMs is the reply's latency; totalMs adds the process exit and, for fresh, the
        // container's removal.
        writeSample('fetch', {
          code: result.code,
          frameMs: result.frameMs,
          mode,
          reply: formatReply(result),
          route,
          totalMs: result.totalMs,
        });
      }
    }
  }
}

const phases: Record<string, (samples: number) => Promise<void>> = {
  fetch: runFetch,
  start: runStart,
  turn: runTurn,
};
const [phase = '', count = '10'] = process.argv.slice(2);
const runPhase = phases[phase];

if (!runPhase) {
  throw new Error(`unknown phase ${phase}`);
}
await runPhase(Number(count));
