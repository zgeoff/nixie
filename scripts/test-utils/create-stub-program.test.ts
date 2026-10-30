import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from './create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-stub-program-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');

  writeFileSync(callsPath, '');

  return { directoryPath: directory, callsPath };
}

test('it prints the answer for the call and exits with its code', async () => {
  const ctx = setupTest();
  const programPath = join(ctx.directoryPath, 'bin', 'docker');

  createStubProgram(programPath, {
    callsPath: ctx.callsPath,
    answers: { 'image inspect nixie:1.2.3': { stdout: 'sha256:aa11\n', exitCode: 3 } },
  });

  const result = await $`${programPath} image inspect nixie:1.2.3`.nothrow().quiet();

  expect(result.exitCode).toBe(3);
  expect(result.stdout.toString()).toBe('sha256:aa11\n');
});

test('it prints nothing and exits 0 for a call with no answer', async () => {
  const ctx = setupTest();
  const programPath = join(ctx.directoryPath, 'bin', 'docker');

  createStubProgram(programPath, {
    callsPath: ctx.callsPath,
    answers: { 'image inspect nixie:1.2.3': { stdout: 'sha256:aa11\n' } },
  });

  const result = await $`${programPath} image ls`.nothrow().quiet();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
});

test('it records each call as its file name and arguments, in order', async () => {
  const ctx = setupTest();
  const dockerPath = join(ctx.directoryPath, 'bin', 'docker');
  const ghPath = join(ctx.directoryPath, 'bin', 'gh');

  createStubProgram(dockerPath, { callsPath: ctx.callsPath });
  createStubProgram(ghPath, { callsPath: ctx.callsPath });

  await $`${dockerPath} compose logs`.quiet();
  await $`${ghPath} release view "v1.2.3 notes"`.quiet();

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    "docker compose logs\ngh release view 'v1.2.3 notes'\n",
  );
});

test('it tells one argument that holds a space from two arguments', async () => {
  const ctx = setupTest();
  const programPath = join(ctx.directoryPath, 'bin', 'bun');

  createStubProgram(programPath, {
    callsPath: ctx.callsPath,
    answers: { "check.ts --title 'feat: add a key'": { stdout: 'one title\n' } },
  });

  const joined = await $`${programPath} check.ts --title ${'feat: add a key'}`.quiet();
  const split = await $`${programPath} check.ts --title feat: add a key`.quiet();

  expect(joined.stdout.toString()).toBe('one title\n');
  expect(split.stdout.toString()).toBe('');
});

test("it quotes an argument's own single quote as a shell does", async () => {
  const ctx = setupTest();
  const programPath = join(ctx.directoryPath, 'bin', 'gh');

  createStubProgram(programPath, { callsPath: ctx.callsPath });

  await $`${programPath} pr edit --title ${"fix: the user's key"}`.quiet();

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    `gh pr edit --title 'fix: the user'\\''s key'\n`,
  );
});
