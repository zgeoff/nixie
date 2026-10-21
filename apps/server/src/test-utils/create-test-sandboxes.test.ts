import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { createTestSandboxes } from './create-test-sandboxes';
import { startTestServer } from './start-test-server';

async function setupTest() {
  const server = await startTestServer();

  return createTestSandboxes({
    log: server.context.log,
    definitions: server.context.definitions,
    toolTarget: server.endpoint.getToolTarget,
    rootDir: join(server.dataDir, 'retiring'),
  });
}

test('it builds the process double', async () => {
  const ctx = await setupTest();

  expect(ctx.sandboxes).toMatchObject({ id: 'process', boundary: 'process' });
});

test('it lists every sandbox the owner held at the retire as retired, and a later one as kept', async () => {
  const ctx = await setupTest();

  const spec = buildMockSandboxSpec({ grants: [], toolRoute: false });

  const old = await ctx.sandboxes.create(spec);
  const retired = await ctx.retireSandboxes(spec.owner);
  const replacement = await ctx.sandboxes.create(spec);
  const listed = await ctx.sandboxes.list(spec.owner);

  expect(retired).toStrictEqual([old.id]);

  expect(listed.map((sandbox) => [sandbox.id, sandbox.isRetired])).toIncludeSameMembers([
    [old.id, true],
    [replacement.id, false],
  ]);
});

test('it never retires a sandbox of another owner', async () => {
  const ctx = await setupTest();
  const other = await ctx.sandboxes.create(buildMockSandboxSpec({ grants: [], toolRoute: false }));

  await ctx.retireSandboxes('conversation');

  const found = await ctx.sandboxes.read(other.id);

  expect(found?.isRetired).toBeFalse();
});

test('it gets a retired sandbox as retired', async () => {
  const ctx = await setupTest();

  const spec = buildMockSandboxSpec({ grants: [], toolRoute: false });

  const sandbox = await ctx.sandboxes.create(spec);

  await ctx.retireSandboxes(spec.owner);

  const found = await ctx.sandboxes.read(sandbox.id);

  expect(found?.isRetired).toBeTrue();
});

test('it gets no sandbox for an ID the double never made', async () => {
  const ctx = await setupTest();

  expect(ctx.sandboxes.read('not-a-sandbox')).resolves.toBeNull();
});
