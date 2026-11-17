import { expect, onTestFinished, test } from 'bun:test';
import { buildSandboxSpec, buildWorkerRunOwner } from '@heynixie/sandbox';
import { buildMockGrantSpec, buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { createImpClient } from '@impz/client';
import invariant from 'tiny-invariant';
import { parseImpConfig } from '../config/parse-imp-config';
import { runProbe } from '../test-utils/run-probe';
import { setupIsolationAdapter } from '../test-utils/setup-isolation-adapter';
import { buildImpPort } from './build-imp-port';

// Bun's skipIf takes a boolean and has no skip from inside a test body, so this gate reads the
// environment when the file loads.
const hasImpHost =
  process.env['NIXIE_IMP_TEST_URL'] !== undefined &&
  process.env['NIXIE_IMP_TEST_TOKEN'] !== undefined &&
  (process.env['NIXIE_IMP_TEST_IMAGE'] ?? '') !== '';

async function setupTest() {
  // The web preload's mock server and DOM replace fetch and WebSocket, so no call would reach impd.
  invariant(
    !('happyDOM' in globalThis),
    'the web test preload is loaded; run the file through `bun run test:imp`, whose bunfig leaves it out',
  );

  const config = parseImpConfig({
    IMP_URL: process.env['NIXIE_IMP_TEST_URL'],
    IMP_TOKEN: process.env['NIXIE_IMP_TEST_TOKEN'],
  });

  const client = createImpClient({ url: config.url, token: config.token });
  const secret = `nixie-test-${crypto.randomUUID().slice(0, 8)}`;
  const upstreamHost = process.env['NIXIE_IMP_TEST_UPSTREAM_HOST'];
  const requests: { readonly path: string; readonly apiKey: string | null }[] = [];

  // Bun clears a request's URL once its response is sent, so the stand-in copies what it checks.
  const answerRequest = (request: Request): Response => {
    requests.push({
      path: new URL(request.url).pathname,
      apiKey: request.headers.get('x-api-key'),
    });

    return Response.json({ ok: true });
  };

  // A relay imp that forwards a fixed port back to this machine needs the stand-in on that port.
  const upstream = Bun.serve({
    hostname: '0.0.0.0',
    port: Number(process.env['NIXIE_IMP_TEST_UPSTREAM_PORT'] ?? '0'),
    fetch: answerRequest,
  });

  onTestFinished(() => upstream.stop(true));

  const isolation = await setupIsolationAdapter({
    port: buildImpPort(config),
    removeSecret: async (name) => {
      await client.secrets.delete({ name });
    },
    publicEgress: config.publicEgress,
    secret,
    ...(upstreamHost === undefined
      ? {}
      : { modelGateway: { modelURL: `http://${upstreamHost}:${upstream.port}` } }),
  });

  return {
    secret,
    requests,
    image: process.env['NIXIE_IMP_TEST_IMAGE'] ?? '',
    createSandbox: isolation.createSandbox,
  };
}

test.skipIf(!hasImpHost)(
  'it lets a conversation imp reach the model host through the broker',
  async () => {
    const ctx = await setupTest();

    const sandbox = await ctx.createSandbox(
      buildMockSandboxSpec({
        kind: 'conversation',
        image: ctx.image,
        grants: [buildMockGrantSpec({ secret: ctx.secret, host: 'api.anthropic.com' })],
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
      }),
    );

    const outcome = await runProbe(sandbox, 'https://api.anthropic.com/v1/models', {
      viaBroker: true,
    });

    expect(outcome).toMatch(/^status=[1-5]\d\d exit=0$/u);
  },
);

test.skipIf(!hasImpHost)(
  'it lets a worker imp reach the model host through the broker, and destroys it',
  async () => {
    const ctx = await setupTest();

    const owner = buildWorkerRunOwner(crypto.randomUUID());

    const sandbox = await ctx.createSandbox(
      buildMockSandboxSpec({
        kind: 'worker',
        owner,
        image: ctx.image,
        grants: [buildMockGrantSpec({ secret: ctx.secret, host: 'api.anthropic.com' })],
        limits: { vcpus: 1, memoryMiB: 384, diskMiB: 4096 },
      }),
    );

    const outcome = await runProbe(sandbox, 'https://api.anthropic.com/v1/models', {
      viaBroker: true,
    });

    await sandbox.destroy();

    expect(outcome).toMatch(/^status=[1-5]\d\d exit=0$/u);
  },
);

test.skipIf(!hasImpHost)(
  'it gives a worker imp no answer from a direct request, with a key of its own or not',
  async () => {
    const ctx = await setupTest();

    const modelGrant = buildMockGrantSpec({ secret: ctx.secret, host: 'api.anthropic.com' });
    const owner = buildWorkerRunOwner(crypto.randomUUID());

    const sandbox = await ctx.createSandbox(
      buildSandboxSpec({
        kind: 'worker',
        owner,
        image: ctx.image,
        limits: { vcpus: 1, memoryMiB: 384, diskMiB: 4096 },
        modelGrant,
      }),
    );

    const viaBroker = await runProbe(sandbox, 'https://api.anthropic.com/v1/models', {
      viaBroker: true,
    });

    const ownKey = await runProbe(sandbox, 'https://api.anthropic.com/v1/messages', {
      viaBroker: false,
      apiKey: 'sk-ant-own-key-test',
    });

    const otherHost = await runProbe(sandbox, 'https://example.com/', { viaBroker: false });
    const literalAddress = await runProbe(sandbox, 'https://1.1.1.1/', { viaBroker: false });
    const brokerOtherHost = await runProbe(sandbox, 'https://example.com/', { viaBroker: true });

    await sandbox.destroy();

    expect(viaBroker).toMatch(/^status=[1-5]\d\d exit=0$/u);
    expect(ownKey).toMatch(/^status=000 exit=[1-9]\d*$/u);
    expect(otherHost).toMatch(/^status=000 exit=[1-9]\d*$/u);
    expect(literalAddress).toMatch(/^status=000 exit=[1-9]\d*$/u);
    expect(brokerOtherHost).not.toMatch(/^status=[23]\d\d /u);
  },
);

test.skipIf(!hasImpHost)(
  'it keeps the count of memory kills of a 192 MiB imp across a sleep and a wake',
  async () => {
    const ctx = await setupTest();

    const sandbox = await ctx.createSandbox(
      buildMockSandboxSpec({
        kind: 'code_run',
        image: ctx.image,
        egress: { kind: 'none' },
        grants: [],
        toolRoute: false,
        limits: { vcpus: 1, memoryMiB: 192, diskMiB: 4096 },
      }),
    );

    // GNU tail buffers the endless line of /dev/zero until the kernel kills it for memory.
    await sandbox.exec({ argv: ['sh', '-c', 'tail /dev/zero'] });

    const before = await sandbox.readMemoryKills();

    invariant(sandbox.suspension.kind === 'memory');

    await sandbox.suspension.sleep();
    await sandbox.suspension.wake();

    const after = await sandbox.readMemoryKills();

    process.stdout.write(
      `memory kills before sleep=${JSON.stringify(before)} after wake=${JSON.stringify(after)}\n`,
    );

    expect(before).toStrictEqual({
      kind: 'count',
      kills: expect.toBeWithin(1, Number.POSITIVE_INFINITY),
    });

    expect(after).toStrictEqual(before);
  },
);

test.skipIf(!hasImpHost || (process.env['NIXIE_IMP_TEST_UPSTREAM_HOST'] ?? '') === '').each([
  ['a Claude route', 'claude-route', 'openrouter-route'],
  ['an OpenRouter route', 'openrouter-route', 'claude-route'],
] as const)(
  'it sends no credential of %s to the other route of the gateway',
  async (_name, ownRoute, otherRoute) => {
    const ctx = await setupTest();

    const sandbox = await ctx.createSandbox(
      buildMockSandboxSpec({
        kind: 'conversation',
        image: ctx.image,
        grants: [
          buildMockGrantSpec({ secret: ctx.secret, host: 'api.anthropic.com', route: ownRoute }),
        ],
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
      }),
    );

    const own = await runProbe(
      sandbox,
      `https://api.anthropic.com/${sandbox.id}/${ownRoute}/v1/messages`,
      {
        viaBroker: true,
      },
    );

    const other = await runProbe(
      sandbox,
      `https://api.anthropic.com/${sandbox.id}/${otherRoute}/v1/messages`,
      {
        viaBroker: true,
      },
    );

    expect({
      own,
      other,
      paths: ctx.requests.map((request) => request.path),
      credentials: ctx.requests.map((request) => request.apiKey),
    }).toStrictEqual({
      own: expect.stringMatching(/^status=200 /u),
      other: expect.stringMatching(/^status=403 /u),
      paths: [`/${sandbox.id}/${ownRoute}/v1/messages`],
      credentials: ['nixie-isolation-dummy'],
    });
  },
);
