import { expect, test } from 'bun:test';
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

  const isolation = await setupIsolationAdapter({
    port: buildImpPort(config),
    removeSecret: async (name) => {
      await client.secrets.delete({ name });
    },
    publicEgress: config.publicEgress,
    secret,
  });

  return {
    secret,
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
