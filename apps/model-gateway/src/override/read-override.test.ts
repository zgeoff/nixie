import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOverride } from './read-override';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-override-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'override.json') };
}

test('it reads a valid override', async () => {
  const ctx = await setupTest();

  const override = { preview: { start: '2026-11-13', dollars: 200 } };

  await writeFile(ctx.path, JSON.stringify(override));

  const read = await readOverride(ctx.path);

  expect(read).toStrictEqual({ kind: 'found', overrides: override });
});

test('it reads no override from a missing file', async () => {
  const ctx = await setupTest();
  const read = await readOverride(ctx.path);

  expect(read).toStrictEqual({ kind: 'none' });
});

test.each([
  ['a file that is not JSON', 'nope'],
  ['an override of a day that is not a date', '{"preview":{"start":"today","dollars":1}}'],
  ['an override with an unknown field', '{"preview":{"start":"2026-11-13","dollars":1,"x":1}}'],
  ['an override with a limit of zero', '{"preview":{"start":"2026-11-13","dollars":0}}'],
])('it reports %s as unreadable, so it binds nothing', async (_name, text) => {
  const ctx = await setupTest();

  await writeFile(ctx.path, text);

  const read = await readOverride(ctx.path);

  expect(read).toMatchObject({ kind: 'unreadable' });
});
