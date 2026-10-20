import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-stub-sops-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, stub: join(import.meta.dir, 'run-stub-sops.ts') };
}

test('it prints the file’s YAML as JSON, as sops decrypt does', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'secrets.yaml'),
    'impd_token: a\nmodel_credentials: { x: b }\n',
  );

  const child = Bun.spawnSync([
    process.execPath,
    ctx.stub,
    'decrypt',
    '--output-type',
    'json',
    join(ctx.directory, 'secrets.yaml'),
  ]);

  expect(child.exitCode).toBe(0);

  expect(JSON.parse(child.stdout.toString())).toStrictEqual({
    impd_token: 'a',
    model_credentials: { x: 'b' },
  });
});

test('it exits 1 with a message for a file it cannot read', async () => {
  const ctx = await setupTest();

  const child = Bun.spawnSync([
    process.execPath,
    ctx.stub,
    'decrypt',
    '--output-type',
    'json',
    join(ctx.directory, 'missing.yaml'),
  ]);

  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString()).toStartWith('Error decrypting file:');
});
