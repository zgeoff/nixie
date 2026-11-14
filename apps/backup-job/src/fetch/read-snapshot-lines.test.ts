import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildResticClient } from '../restic/build-restic-client';
import { createStubRestic } from '../test-utils/create-stub-restic';
import { readSnapshotLines } from './read-snapshot-lines';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-snapshot-lines-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const restic = await createStubRestic(directory);

  const repos = {
    data: buildResticClient(
      { restic, backendEnv: {} },
      { repository: join(directory, 'data'), password: 'data-pass' },
      'data',
    ),
    keys: buildResticClient(
      { restic, backendEnv: {} },
      { repository: join(directory, 'keys'), password: 'key-pass' },
      'key',
    ),
  };

  await repos.data.createRepository();
  await repos.keys.createRepository();

  await writeFile(join(directory, 'copy.bin'), 'copy');

  return { directory, repos };
}

test('it prints one line for each snapshot of the data and key repositories', async () => {
  const ctx = await setupTest();

  const keyID = await ctx.repos.keys.writeSnapshot(join(ctx.directory, 'copy.bin'), 'keys.db', [
    'set-4',
    'kind-forget',
    'publish-7',
  ]);

  const dataID = await ctx.repos.data.writeSnapshot(join(ctx.directory, 'copy.bin'), 'nixie.db', [
    'set-4',
    'kind-forget',
  ]);

  const lines = await readSnapshotLines(ctx.repos);

  expect(lines.map((line): unknown => JSON.parse(line))).toStrictEqual([
    {
      repository: 'data',
      snapshotID: dataID,
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
      set: 4,
      kind: 'forget',
      publish: null,
    },
    {
      repository: 'key',
      snapshotID: keyID,
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
      set: 4,
      kind: 'forget',
      publish: 7,
    },
  ]);
});

test('it prints nothing for repositories with no snapshot', async () => {
  const ctx = await setupTest();
  const lines = await readSnapshotLines(ctx.repos);

  expect(lines).toStrictEqual([]);
});
