import { expect, test } from 'bun:test';
import { readSandboxOwners } from './read-sandbox-owners';
import { buildMockSandboxSpec } from './test-utils/build-mock-sandbox-spec';
import { setupTestRecorder } from './test-utils/setup-test-recorder';

function setupTest() {
  return setupTestRecorder();
}

test("it reads each owner of the adapter's sandboxes once, and no owner whose sandboxes are gone", async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: 'nixie-a',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'k3vq8m2xpa' }),
    },
    {
      event: 'created',
      sandboxID: 'nixie-b',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'k3vq8m2xpa' }),
    },
    {
      event: 'created',
      sandboxID: 'nixie-c',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'conversation' }),
    },
    {
      event: 'created',
      sandboxID: 'nixie-d',
      adapter: 'process',
      spec: buildMockSandboxSpec({ owner: 'web_fetch' }),
    },
    {
      event: 'created',
      sandboxID: 'nixie-e',
      adapter: 'imp',
      spec: buildMockSandboxSpec({ owner: 'p2xc7d4nqa' }),
    },
    { event: 'destroyed', sandboxID: 'nixie-e', reason: 'destroyed' },
  ]);

  const owners = await readSandboxOwners(ctx.log, 'imp');

  expect(owners).toStrictEqual(['conversation', 'k3vq8m2xpa']);
});
