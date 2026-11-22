import { expect, onTestFinished, test } from 'bun:test';
import type { ToolDefinition } from '@heynixie/tools';
import type { ComputerHandler, ComputerReply, ComputerRequest } from '@heynixie/wire';
import { runComputerGuest } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { startTestLog } from '../test-utils/start-test-log';
import { buildComputerTools } from './build-computer-tools';
import { startComputer } from './start-computer';

interface Replies {
  readonly page: Extract<ComputerReply, { kind: 'page' }>;
  readonly run: Extract<ComputerReply, { kind: 'run' }>;
}

interface SetupOptions {
  readonly answer: (replies: Replies) => ComputerHandler;
  readonly secret?: string;
}

async function setupTest(options: SetupOptions) {
  const requests: ComputerRequest[] = [];

  const replies: Replies = {
    page: {
      kind: 'page' as const,
      ok: true as const,
      tab: 'g1',
      isDiskNew: false,
      page: {
        url: 'https://site.test/form',
        status: 200,
        title: 'A form',
        text: 'Name [E1 textbox "Name"]',
        links: [],
      },
    },
    run: {
      kind: 'run' as const,
      ok: true as const,
      run: {
        exitCode: 0,
        stdout: { text: 'hello\n', isCut: false },
        stderr: { text: '', isCut: false },
        seconds: 0.1,
        isDiskNew: true,
      },
    },
  };

  const answer = options.answer(replies);

  const adapter = buildStubSandboxAdapter(async (stdin, stdout) => {
    await runComputerGuest(
      { input: stdin, write: (bytes) => stdout.write(bytes) },
      (request, askScan, askScanText) => {
        requests.push(request);

        return answer(request, askScan, askScanText);
      },
      10_000_000,
    );

    return 0;
  });

  const computer = startComputer({
    adapter,
    images: { browser: 'browser-image', shell: 'shell-image' },
    argv: { browser: ['guest'], shell: ['guest'] },
    deniedRanges: [],
    timeZone: 'UTC',
    logger: () => {},
  });

  onTestFinished(async () => {
    await computer.stop();
  });

  const built = buildComputerTools({
    computer,
    log: await startTestLog(),
    findSecret: (text) =>
      options.secret !== undefined && text.includes(options.secret) ? { rule: 'test-rule' } : null,
    isOwnerTyped: () => Promise.resolve(false),
    logger: () => {},
    deniedRanges: [],
    fetch: {
      limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 20_000, imageBytes: 100 },
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
      secretTypedURLCovers: 'redirects',
    },
  });

  const findTool = (name: string): ToolDefinition => {
    const tool = built.tools.find((candidate) => candidate.name === name);

    invariant(tool, `no tool ${name}`);

    return tool;
  };

  const context = {
    callSequence: 1,
    run: {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: [],
      model: { model: 'model-a', profile: 'chat-direct' },
      session: { key: 'session-a', invalidatedThrough: 0 },
    },
  };

  return {
    requests,
    context,
    call: (name: string, input: Record<string, string | number | boolean>) =>
      findTool(name).run({ callID: 'call-1', tool: name, input, toolUseID: null }, context),
    prepare: (name: string, input: Record<string, string>) => {
      const prepare = findTool(name).prepare;

      invariant(prepare, `${name} has no prepare`);

      return prepare(input, context);
    },
    attempt: (tool: string, args: Record<string, string>) =>
      built.connector.run({
        actionID: 'action-1',
        tool,
        arguments: args,
        attempt: 1,
        idempotencyKey: 'key',
        destinations: [],
      }),
  };
}

test('it opens a page in a tab the model can name and stores its text as a page', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });
  const outcome = await ctx.call('computer.open', { url: 'https://site.test/form' });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      tab: 't1',
      url: 'https://site.test/form',
      status: 200,
      title: 'A form',
      page: expect.stringMatching(/^[a-z][\da-z]{9}$/u),
      part: 1,
      parts: 1,
      text: 'Name [E1 textbox "Name"]',
      isDiskNew: false,
    },
  });
});

test('it refuses an open whose redirect holds a secret and tells the model why', async () => {
  const ctx = await setupTest({
    secret: 'hunter2',
    answer: (replies) => async (_request, askScan) => {
      try {
        await askScan('https://site.test/next?key=hunter2');
      } catch {
        return { kind: 'failed', ok: false, reason: 'failed' };
      }

      return replies.page;
    },
  });

  const outcome = await ctx.call('computer.open', { url: 'https://site.test/form' });

  expect(outcome).toMatchObject({
    status: 'ok',
    refusalCode: 'SECRET_REFUSED',
    result: { refused: { code: 'SECRET_REFUSED' } },
  });
});

test('it refuses a call whose request body holds a secret the URL does not', async () => {
  const ctx = await setupTest({
    secret: 'hunter2',
    answer: (replies) => async (_request, _askScan, askScanText) => {
      try {
        await askScanText('POST /up\n\nkey=hunter2');
      } catch {
        return { kind: 'failed', ok: false, reason: 'failed' };
      }

      return replies.page;
    },
  });

  const outcome = await ctx.call('computer.open', { url: 'https://site.test/form' });

  expect(outcome).toMatchObject({
    status: 'ok',
    refusalCode: 'SECRET_REFUSED',
    result: { refused: { code: 'SECRET_REFUSED' } },
  });
});

test('it refuses a read of a tab the browser does not hold', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });
  const outcome = await ctx.call('computer.read', { tab: 't9', mode: 'text' });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'TAB_GONE' });
});

test('it prepares a click with the host of the tab as its destination and the URL it expects', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });

  await ctx.call('computer.open', { url: 'https://site.test/form' });

  const prepared = await ctx.prepare('computer.click', { tab: 't1', element: 'E1' });

  expect(prepared).toStrictEqual({
    destinations: ['site.test'],
    expectURL: 'https://site.test/form',
  });
});

test('it runs a queued click against the URL its preparation saw', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });

  await ctx.call('computer.open', { url: 'https://site.test/form' });
  await ctx.prepare('computer.click', { tab: 't1', element: 'E1' });

  const response = await ctx.attempt('computer.click', { tab: 't1', element: 'E1' });

  expect(response.kind).toBe('success');

  expect(ctx.requests.at(-1)).toStrictEqual({
    op: 'act',
    tab: 'g1',
    expectURL: 'https://site.test/form',
    acts: [{ kind: 'click', element: 'E1' }],
    submit: false,
  });
});

test('it refuses a queued click when the guest says the page changed', async () => {
  const ctx = await setupTest({
    answer: (replies) => (request) => {
      const failed = {
        kind: 'failed' as const,
        ok: false as const,
        reason: 'page_changed' as const,
      };

      const reply = request.op === 'act' ? failed : replies.page;

      return Promise.resolve(reply);
    },
  });

  await ctx.call('computer.open', { url: 'https://site.test/form' });
  await ctx.prepare('computer.click', { tab: 't1', element: 'E1' });

  const response = await ctx.attempt('computer.click', { tab: 't1', element: 'E1' });

  expect(response.kind).toBe('refused');
});

test('it runs a queued command in a bash login shell and returns its output', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.run) });

  await ctx.prepare('computer.run', { command: 'echo hello' });

  const response = await ctx.attempt('computer.run', { command: 'echo hello' });

  expect(response).toStrictEqual({
    kind: 'success',
    result: {
      exitCode: 0,
      stdout: 'hello\n',
      stderr: '',
      isStdoutCut: false,
      isStderrCut: false,
      seconds: 0.1,
      isDiskNew: true,
    },
  });

  expect(ctx.requests.at(-1)).toStrictEqual({
    op: 'run',
    argv: ['bash', '-lc', 'echo hello'],
    timeoutSeconds: 60,
  });
});

test('it refuses a waiting command after a file was written to the disk', async () => {
  const ctx = await setupTest({
    answer: (replies) => (request) => {
      const written = {
        kind: 'written' as const,
        ok: true as const,
        path: 'a.txt',
        bytes: 2,
        isDiskNew: false,
      };

      const reply = request.op === 'writeFile' ? written : replies.run;

      return Promise.resolve(reply);
    },
  });

  await ctx.prepare('computer.run', { command: 'cat a.txt' });
  await ctx.call('computer.write_file', { path: 'a.txt', text: 'hi' });

  const response = await ctx.attempt('computer.run', { command: 'cat a.txt' });

  expect(response).toMatchObject({
    kind: 'refused',
    reason: expect.stringContaining('files changed'),
  });
});

test('it reads a text file of the shell and refuses a file that is not text', async () => {
  const ctx = await setupTest({
    answer: () => (request) =>
      Promise.resolve({
        kind: 'file' as const,
        ok: true as const,
        name: 'a',
        isDiskNew: false,
        base64:
          request.op === 'readFile' && request.path === 'a.bin'
            ? Buffer.from([0, 1, 2, 255]).toString('base64')
            : Buffer.from('notes').toString('base64'),
      }),
  });

  const text = await ctx.call('computer.read_file', { path: 'a.txt' });
  const binary = await ctx.call('computer.read_file', { path: 'a.bin' });

  expect(text).toStrictEqual({
    status: 'ok',
    result: { path: 'a.txt', text: 'notes', isDiskNew: false },
  });

  expect(binary).toMatchObject({ refusalCode: 'NOT_TEXT' });
});
