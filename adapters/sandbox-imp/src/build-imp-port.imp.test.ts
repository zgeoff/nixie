import { expect, test } from 'bun:test';
import { buildMockGrantSpec, buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { createImpClient } from '@impz/client';
import invariant from 'tiny-invariant';
import { buildImpPort } from './build-imp-port';
import { parseImpConfig } from './parse-imp-config';
import { runProbe } from './test-utils/run-probe';
import { setupIsolationAdapter } from './test-utils/setup-isolation-adapter';

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
