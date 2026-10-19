import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockSandboxSpec, setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { writeKeptSession } from '@heynixie/sessions';
import { buildGuestCommand } from './build-guest-command';
import { buildSandboxAdapter } from './build-sandbox-adapter';

// The test sandbox, the process double, on a folder of its own, and the command the server gives a
// guest on it. Each sandbox's filesystem is <rootDir>/<id>/fs, its guest's HOME.
async function setupTest() {
  const recorder = await setupTestRecorder();

  // the layout script reads the guest's home with pwd -P, so the root is the resolved path
  const tempDir = await mkdtemp(join(tmpdir(), 'nixie-kept-session-'));

  onTestFinished(() => rm(tempDir, { recursive: true, force: true }));

  const rootDir = await realpath(tempDir);

  const adapter = buildSandboxAdapter({
    recorder: recorder.recorder,
    toolTarget: () => {
      throw new Error('no sandbox here has a tool route');
    },
    sandbox: { adapter: 'test' },
    testRootDir: rootDir,
    hostEnv: {},
  });

  return { rootDir, adapter, command: buildGuestCommand(adapter) };
}

test('it carries a kept session into the project folder of the replacement guest, with no staged copy left', async () => {
  const ctx = await setupTest();

  const spec = buildMockSandboxSpec({ kind: 'conversation', grants: [], toolRoute: false });

  const from = await ctx.adapter.create(spec);
  const to = await ctx.adapter.create(spec);

  const sessionID = crypto.randomUUID();

  const fromProject = join(
    ctx.rootDir,
    from.id,
    'fs/.claude/projects',
    join(ctx.rootDir, from.id, 'fs/conversation').replaceAll(/[^a-zA-Z0-9]/gu, '-'),
  );

  await mkdir(join(fromProject, sessionID, 'subagents'), { recursive: true });

  await Bun.write(join(fromProject, `${sessionID}.jsonl`), '{"uuid":"a"}\n');
  await Bun.write(join(fromProject, sessionID, 'subagents/agent-1.jsonl'), '{"uuid":"b"}\n');

  await writeKeptSession({ from, to, command: ctx.command, sessionID });

  const toProject = join(
    ctx.rootDir,
    to.id,
    'fs/.claude/projects',
    join(ctx.rootDir, to.id, 'fs/conversation').replaceAll(/[^a-zA-Z0-9]/gu, '-'),
  );

  const landed = await readdir(toProject, { recursive: true });
  const transcript = await readFile(join(toProject, `${sessionID}.jsonl`), 'utf8');

  expect(landed).toIncludeSameMembers([
    `${sessionID}.jsonl`,
    sessionID,
    `${sessionID}/subagents`,
    `${sessionID}/subagents/agent-1.jsonl`,
  ]);

  expect(transcript).toBe('{"uuid":"a"}\n');
});

test('it refuses to carry a session from a sandbox that holds no transcript of it', async () => {
  const ctx = await setupTest();

  const spec = buildMockSandboxSpec({ kind: 'conversation', grants: [], toolRoute: false });

  const from = await ctx.adapter.create(spec);
  const to = await ctx.adapter.create(spec);

  const sessionID = crypto.randomUUID();

  expect(writeKeptSession({ from, to, command: ctx.command, sessionID })).rejects.toThrow(
    `the sandbox ${from.id} holds no transcript of session ${sessionID}`,
  );
});

test('it leaves no resumable transcript when the publish of the staged copy fails', async () => {
  const ctx = await setupTest();

  const spec = buildMockSandboxSpec({ kind: 'conversation', grants: [], toolRoute: false });

  const from = await ctx.adapter.create(spec);
  const to = await ctx.adapter.create(spec);

  const sessionID = crypto.randomUUID();

  const fromProject = join(
    ctx.rootDir,
    from.id,
    'fs/.claude/projects',
    join(ctx.rootDir, from.id, 'fs/conversation').replaceAll(/[^a-zA-Z0-9]/gu, '-'),
  );

  const toProject = join(
    ctx.rootDir,
    to.id,
    'fs/.claude/projects',
    join(ctx.rootDir, to.id, 'fs/conversation').replaceAll(/[^a-zA-Z0-9]/gu, '-'),
  );

  await mkdir(fromProject, { recursive: true });

  await Bun.write(join(fromProject, `${sessionID}.jsonl`), '{"uuid":"a"}\n');

  // a folder where the transcript goes, so mv moves the staged copy into it, onto a folder of the
  // staged copy's name, which mv cannot overwrite with a file whatever user runs it
  await mkdir(join(toProject, `${sessionID}.jsonl`, `${sessionID}.jsonl.copy`), {
    recursive: true,
  });

  await Bun.write(join(toProject, `${sessionID}.jsonl`, `${sessionID}.jsonl.copy`, 'held'), '');

  const failure = await writeKeptSession({ from, to, command: ctx.command, sessionID }).then(
    () => null,
    (error: unknown) => error,
  );

  const target = await stat(join(toProject, `${sessionID}.jsonl`));

  expect(failure).toMatchObject({
    message: expect.toStartWith(`the sandbox ${to.id} did not publish the session transcript`),
  });

  expect(target.isFile()).toBeFalse();
});
