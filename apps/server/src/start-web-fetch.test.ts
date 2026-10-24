import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { createSandboxAdapter } from './create-sandbox-adapter';
import { startWebFetch } from './start-web-fetch';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  // onTestFinished runs its callbacks first in, first out, so a sandbox on the stack is destroyed
  // while the recorder's writer still runs.
  onTestFinished(() => stack.disposeAsync());

  const testRecorder = await setupTestRecorder();

  return {
    dataDir: testRecorder.log.writer.dataDir,
    log: testRecorder.log,
    recorder: testRecorder.recorder,
    stack,
  };
}

test("it fetches through a new fetcher process in a test build's fetch sandbox, and destroys the sandbox", async () => {
  const ctx = await setupTest();

  const adapter = createSandboxAdapter({
    recorder: ctx.recorder,
    toolTarget: () => ({ path: '/nonexistent.sock' }),
    sandbox: { adapter: 'test' },
    testRootDir: ctx.dataDir,
    hostEnv: {},
  });

  const webFetch = startWebFetch({
    adapter,
    image: 'fetch',
    argv: [process.execPath, join(import.meta.dir, '../../../guests/fetch/src/main.ts')],
    deniedRanges: [],
    log: ctx.log,
  });

  ctx.stack.defer(() => webFetch.stop());

  const outcome = await webFetch.tool.run(
    { callID: 'call-1', tool: 'web_fetch', input: { url: 'https://localhost/' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['web_fetch'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
    },
  );

  await waitForCondition(async () => {
    const left = await ctx.recorder.list('process', 'web_fetch');

    return left.length === 0;
  });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.toBeOneOf([
      'localhost resolves to 127.0.0.1, which is not a public address',
      'localhost resolves to ::1, which is not a public address',
    ]),
  });
});

test("it reads a skill's page through its own fetch sandbox, which refuses a private address", async () => {
  const ctx = await setupTest();

  const adapter = createSandboxAdapter({
    recorder: ctx.recorder,
    toolTarget: () => ({ path: '/nonexistent.sock' }),
    sandbox: { adapter: 'test' },
    testRootDir: ctx.dataDir,
    hostEnv: {},
  });

  const webFetch = startWebFetch({
    adapter,
    image: 'fetch',
    argv: [process.execPath, join(import.meta.dir, '../../../guests/fetch/src/main.ts')],
    deniedRanges: [],
    log: ctx.log,
  });

  ctx.stack.defer(() => webFetch.stop());

  const reply = await webFetch.readSkillPage('https://localhost/skills/SKILL.md');

  await waitForCondition(async () => {
    const left = await ctx.recorder.list('process', 'skill_fetch');

    return left.length === 0;
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: expect.toBeOneOf([
      'localhost resolves to 127.0.0.1, which is not a public address',
      'localhost resolves to ::1, which is not a public address',
    ]),
  });
});

test("it returns a skill file past the web fetch's text limit whole", async () => {
  const ctx = await setupTest();

  const adapter = createSandboxAdapter({
    recorder: ctx.recorder,
    toolTarget: () => ({ path: '/nonexistent.sock' }),
    sandbox: { adapter: 'test' },
    testRootDir: ctx.dataDir,
    hostEnv: {},
  });

  const webFetch = startWebFetch({
    adapter,
    image: 'fetch',
    argv: [process.execPath, join(import.meta.dir, 'test-utils/run-stub-fetcher.ts')],
    deniedRanges: [],
    log: ctx.log,
  });

  ctx.stack.defer(() => webFetch.stop());

  const reply = await webFetch.readSkillPage('https://pages.test/files/30000');

  expect(reply).toMatchObject({ kind: 'page', text: 'x'.repeat(30_000), isTruncated: false });
});
