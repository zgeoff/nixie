import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-throwaway-secrets-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const githubEnv = join(directory, 'github-env');

  writeFileSync(githubEnv, '');

  return {
    runnerTemp: directory,
    githubEnv,
    scriptPath: join(import.meta.dir, 'write-throwaway-secrets.ts'),
  };
}

test('it writes a secrets file with a random deployment key, readable by its owner alone', async () => {
  const ctx = setupTest();

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ RUNNER_TEMP: ctx.runnerTemp, GITHUB_ENV: ctx.githubEnv })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(join(ctx.runnerTemp, 'secrets.yaml'), 'utf8')).toMatch(
    /^deployment_key: [A-Za-z0-9+/]{43}=\nmodel_credentials:\n {2}anthropic: invented-placeholder\n$/u,
  );

  expect(statSync(join(ctx.runnerTemp, 'secrets.yaml')).mode & 0o777).toBe(0o600);
});

test('it writes an invented age key, readable by its owner alone', async () => {
  const ctx = setupTest();

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ RUNNER_TEMP: ctx.runnerTemp, GITHUB_ENV: ctx.githubEnv })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(join(ctx.runnerTemp, 'age.key'), 'utf8')).toBe(
    'invented-age-key-for-the-compose-check\n',
  );

  expect(statSync(join(ctx.runnerTemp, 'age.key')).mode & 0o777).toBe(0o600);
});

test('it names both files in the job env', async () => {
  const ctx = setupTest();

  await $`${process.execPath} ${ctx.scriptPath}`
    .env({ RUNNER_TEMP: ctx.runnerTemp, GITHUB_ENV: ctx.githubEnv })
    .quiet();

  expect(readFileSync(ctx.githubEnv, 'utf8')).toBe(
    `NIXIE_SECRETS_FILE=${ctx.runnerTemp}/secrets.yaml\nNIXIE_AGE_KEY_FILE=${ctx.runnerTemp}/age.key\n`,
  );
});

test('it prints its usage, and writes nothing, when the step passes an argument', async () => {
  const ctx = setupTest();

  const result = await $`${process.execPath} ${ctx.scriptPath} extra`
    .env({ RUNNER_TEMP: ctx.runnerTemp, GITHUB_ENV: ctx.githubEnv })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toBe('usage: write-throwaway-secrets.ts\n');
  expect(readFileSync(ctx.githubEnv, 'utf8')).toBe('');
});
