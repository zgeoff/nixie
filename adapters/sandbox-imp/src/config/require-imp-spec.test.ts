import { expect, onTestFinished, test } from 'bun:test';
import { buildMockGrantSpec, buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { TEST_TOKEN, startTestImpd } from '@impz/testing';
import { buildImpPort } from '../sandbox/build-imp-port';
import { requireImpSpec } from './require-imp-spec';

async function setupTest() {
  const impd = await startTestImpd();

  onTestFinished(impd.stop);

  const port = buildImpPort({ url: impd.url, token: TEST_TOKEN });

  const addSecret = (name: string, upstream?: string) =>
    port.addSecret({
      name,
      value: 'not-a-real-value',
      host: 'api.anthropic.com',
      header: 'x-api-key',
      scheme: 'raw',
      ...(upstream === undefined ? {} : { upstream }),
    });

  return { port, addSecret };
}

test('it allows a model secret that sends to the gateway model URL', async () => {
  const ctx = await setupTest();

  await ctx.addSecret('nixie-test-model', 'http://10.1.2.3:18081');

  const spec = buildMockSandboxSpec({
    kind: 'conversation',
    grants: [
      buildMockGrantSpec({
        secret: 'nixie-test-model',
        host: 'api.anthropic.com',
        route: 'claude-main',
      }),
    ],
  });

  expect(
    requireImpSpec(ctx.port, null, spec, { modelURL: 'http://10.1.2.3:18081/' }),
  ).resolves.toBeUndefined();
});

test('it refuses a model secret that sends to another upstream, and names the secret', async () => {
  const ctx = await setupTest();

  await ctx.addSecret('nixie-test-model', 'http://10.9.9.9:18081');

  const spec = buildMockSandboxSpec({
    kind: 'conversation',
    grants: [
      buildMockGrantSpec({
        secret: 'nixie-test-model',
        host: 'api.anthropic.com',
        route: 'claude-main',
      }),
    ],
  });

  expect(
    requireImpSpec(ctx.port, null, spec, { modelURL: 'http://10.1.2.3:18081' }),
  ).rejects.toThrow(/nixie-test-model must send to http:\/\/10\.1\.2\.3:18081/u);
});

test('it refuses a model secret with no upstream, and names the secret', async () => {
  const ctx = await setupTest();

  await ctx.addSecret('nixie-test-model');

  const spec = buildMockSandboxSpec({
    kind: 'conversation',
    grants: [
      buildMockGrantSpec({
        secret: 'nixie-test-model',
        host: 'api.anthropic.com',
        route: 'claude-main',
      }),
    ],
  });

  expect(
    requireImpSpec(ctx.port, null, spec, { modelURL: 'http://10.1.2.3:18081' }),
  ).rejects.toThrow(/nixie-test-model must send to/u);
});

test('it refuses a model secret that impd lacks, and names the secret', async () => {
  const ctx = await setupTest();

  const spec = buildMockSandboxSpec({
    kind: 'conversation',
    grants: [
      buildMockGrantSpec({
        secret: 'nixie-test-absent',
        host: 'api.anthropic.com',
        route: 'claude-main',
      }),
    ],
  });

  expect(
    requireImpSpec(ctx.port, null, spec, { modelURL: 'http://10.1.2.3:18081' }),
  ).rejects.toThrow(/nixie-test-absent/u);
});

test('it checks no upstream when no gateway counts', async () => {
  const ctx = await setupTest();

  await ctx.addSecret('nixie-test-model');

  const spec = buildMockSandboxSpec({
    kind: 'conversation',
    grants: [
      buildMockGrantSpec({
        secret: 'nixie-test-model',
        host: 'api.anthropic.com',
        route: 'claude-main',
      }),
    ],
  });

  expect(requireImpSpec(ctx.port, null, spec, null)).resolves.toBeUndefined();
});

test('it refuses a grant with no route when the gateway counts, and names the secret', async () => {
  const ctx = await setupTest();

  await ctx.addSecret('nixie-test-model', 'http://10.1.2.3:18081');

  const spec = buildMockSandboxSpec({
    kind: 'conversation',
    grants: [
      buildMockGrantSpec({ secret: 'nixie-test-model', host: 'api.anthropic.com', route: null }),
    ],
  });

  expect(
    requireImpSpec(ctx.port, null, spec, { modelURL: 'http://10.1.2.3:18081' }),
  ).rejects.toThrow(/grant nixie-test-model names no gateway route/u);
});
