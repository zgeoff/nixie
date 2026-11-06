import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getSandboxRootDir } from './get-sandbox-root-dir';
import { startSpawnedNixie } from './test-utils/start-spawned-nixie';

function setupTest() {
  return startSpawnedNixie();
}

test('it names the folder that holds a folder for each sandbox of the process double', async () => {
  const ctx = await setupTest();

  const server = ctx.harness.start();

  await server.ready;

  const root = getSandboxRootDir(ctx.dataDir);

  const ids = await readdir(root);

  server.signal('SIGTERM');

  const run = await server.waitForExit();

  expect(root).toBe(join(ctx.dataDir, 'sandboxes'));
  expect(ids.length).toBeGreaterThan(0);

  expect(
    run.records
      .filter((record) => record.kind === 'sandbox.created')
      .map((record) => record.payload['sandboxID']),
  ).toIncludeAllMembers(ids);
});
