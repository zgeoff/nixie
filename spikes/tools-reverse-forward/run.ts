// oxlint-disable one-var, sort-vars, no-await-in-loop -- sequential lifecycle and transport measurements
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cli = process.env.IMP_CLI ?? 'imp',
  api = process.env.IMP_URL ?? '',
  work = process.env.SPIKE_WORK ?? '',
  data = process.env.SPIKE_DEV_DATA ?? '',
  bridge = process.env.SPIKE_BRIDGE ?? '172.17.0.1',
  box = 'nixie-route-probe',
  secret = 'nixie-route-probe-model',
  token = crypto.randomUUID(),
  here = import.meta.dir,
  results = join(here, 'results');
if (
  !/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/u.test(api) ||
  !process.env.IMP_TOKEN ||
  !work ||
  !data
) {
  throw new Error(
    'Set IMP_URL to an explicit local dev instance, IMP_TOKEN, SPIKE_WORK and SPIKE_DEV_DATA.',
  );
}
mkdirSync(work, { recursive: true });
mkdirSync(results, { recursive: true });
async function runCommand(args: string[], input?: string): Promise<string> {
  const child = Bun.spawn(args, {
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
    throw new Error(`${args[0]} ${args[1]} failed: ${error}`);
  }
  return output;
}
function runImp(...args: string[]): Promise<string> {
  return runCommand([cli, ...args]);
}
const boxesJson = await runImp('ls', '--json'),
  boxes = JSON.parse(boxesJson) as { name: string }[],
  secrets = await runImp('secret', 'ls');
if (boxes.some((row) => row.name === box) || secrets.includes(secret)) {
  throw new Error('Probe names already exist; refusing to overwrite them.');
}
await runCommand([
  'openssl',
  'req',
  '-x509',
  '-newkey',
  'rsa:2048',
  '-nodes',
  '-keyout',
  join(work, 'key.pem'),
  '-out',
  join(work, 'cert.pem'),
  '-days',
  '1',
  '-subj',
  '/CN=localhost',
  '-addext',
  `subjectAltName=DNS:localhost,IP:${bridge}`,
]);
const upstreamPath = join(data, 'broker-test-upstreams.json'),
  previousUpstreams = existsSync(upstreamPath) ? readFileSync(upstreamPath) : undefined,
  certPath = join(work, 'cert.pem'),
  cert = readFileSync(certPath, 'utf8');
writeFileSync(
  upstreamPath,
  JSON.stringify({
    ca: cert,
    upstreams: { 'api.anthropic.com': `https://${bridge}:8794` },
  }),
);
const serve = Bun.spawn(['bun', join(here, 'serve.ts')], {
  env: {
    ...process.env,
    SPIKE_BIND: '0.0.0.0',
    SPIKE_TOOLS_PORT: '8793',
    SPIKE_MODEL_PORT: '8794',
    SPIKE_CERT: join(work, 'cert.pem'),
    SPIKE_KEY: join(work, 'key.pem'),
    SPIKE_MCP_TOKEN: token,
  },
  stdout: Bun.file(join(work, 'serve.log')),
  stderr: Bun.file(join(work, 'serve-error.log')),
});
let proxy: ReturnType<typeof Bun.spawn> | null = null,
  madeBox = false,
  madeSecret = false;
async function waitForTools(url: string): Promise<void> {
  const stop = Date.now() + 30_000;
  while (Date.now() < stop) {
    try {
      const response = await fetch(`${url}/bench`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        return;
      }
    } catch {
      /* poll readiness */
    }
    await Bun.sleep(100);
  }
  throw new Error('Tool endpoint did not become ready.');
}
async function runGuest(label: string, url: string, mode: string): Promise<void> {
  const output = await runImp(
    'exec',
    box,
    '--',
    'env',
    `SPIKE_TOOLS_URL=${url}`,
    `SPIKE_MCP_TOKEN=${token}`,
    `NO_PROXY=${bridge},127.0.0.1,localhost`,
    `SPIKE_BRIDGE=${bridge}`,
    `SPIKE_API_PORT=${new URL(api).port}`,
    'bun',
    '/tools-reverse-forward/guest.ts',
    mode,
  );
  writeFileSync(join(results, `${label}.jsonl`), output);
  console.log(`${label}: ${output.trim()}`);
}
try {
  await waitForTools(`http://127.0.0.1:8793`);
  await runImp('new', box, '--image', 'ubuntu', '--memory', '2g');
  madeBox = true;
  await runImp(
    'exec',
    box,
    '--',
    'sh',
    '-c',
    'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates >/dev/null 2>&1',
  );
  await runImp('cp', process.execPath, `${box}:/usr/local/bin/bun`);
  await runImp('cp', here, `${box}:/`);
  await runCommand([cli, 'secret', 'add', secret, '--kind', 'anthropic'], 'route-model-test-value');
  madeSecret = true;
  await runImp('grant', box, secret);
  await runImp('policy', box, 'box', '--allow', `${bridge}/32`);
  await runGuest('direct', `http://${bridge}:8793`, 'bench');
  await runGuest('isolation-control', `http://${bridge}:8793`, 'control');
  await runGuest('sdk-direct', `http://${bridge}:8793`, 'sdk');
  proxy = Bun.spawn([cli, 'proxy', box, '--reverse', '8901:8793'], {
    stdout: Bun.file(join(work, 'proxy.log')),
    stderr: Bun.file(join(work, 'proxy-error.log')),
  });

  // exec remains a host-control operation while network egress is denied.
  await runImp('policy', box, 'none');
  await Bun.sleep(500);
  await runGuest('reverse', 'http://127.0.0.1:8901', 'bench');
  await runGuest('sdk-reverse', 'http://127.0.0.1:8901', 'sdk');
  await runGuest('isolation', 'http://127.0.0.1:8901', 'isolation');
  await runImp('sleep', box);
  const sleepState = await runImp('ls', '--json');
  writeFileSync(join(results, 'sleep-state.json'), sleepState);
  await runImp('wake', box);
  await runGuest('sdk-after-wake', 'http://127.0.0.1:8901', 'sdk');
  const log = readFileSync(join(work, 'serve.log'), 'utf8');
  writeFileSync(join(results, 'protocol.jsonl'), log);
  if (!log.includes('subscriptions/listen') || !log.includes('2026-07-28')) {
    throw new Error('Missing v2 streaming protocol evidence.');
  }
} finally {
  proxy?.kill();
  serve.kill();
  await Promise.all([proxy?.exited, serve.exited]);
  if (previousUpstreams) {
    writeFileSync(upstreamPath, previousUpstreams);
  } else {
    rmSync(upstreamPath, { force: true });
  }
  if (madeBox) {
    await runImp('rm', box);
  }
  if (madeSecret) {
    await runImp('secret', 'rm', secret);
  }
}
