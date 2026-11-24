import { expect, onTestFinished, test } from 'bun:test';
import { buildActionHash } from '@heynixie/policy';
import { buildSandboxSpec } from '@heynixie/sandbox';
import type { DirectResult, Prepared, ToolDefinition } from '@heynixie/tools';
import type { ComputerHandler, ComputerReply, ComputerRequest } from '@heynixie/wire';
import { runComputerGuest } from '@heynixie/wire';
import { waitFor } from '@zgeoff/testing';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { encodeTestImage } from '../test-utils/encode-test-image';
import { startTestLog } from '../test-utils/start-test-log';
import { buildComputerTools } from './build-computer-tools';
import { startComputer } from './start-computer';

interface Replies {
  readonly page: Extract<ComputerReply, { kind: 'page' }>;
  readonly run: Extract<ComputerReply, { kind: 'run' }>;
  readonly scroll: Extract<ComputerReply, { kind: 'scroll' }>;
  readonly shot: Extract<ComputerReply, { kind: 'screenshot' }>;
  readonly stale: Extract<ComputerReply, { kind: 'failed' }>;
  readonly desktop: Extract<ComputerReply, { kind: 'desktop' }>;
  readonly screen: Extract<ComputerReply, { kind: 'screen' }>;
  readonly target: Extract<ComputerReply, { kind: 'screen-target' }>;
}

interface SetupOptions {
  readonly answer?: (replies: Replies) => ComputerHandler;
  readonly secret?: string;
  readonly imageLongEdge?: number;
  readonly turnWaitMs?: number;
}

async function setupTest(options: SetupOptions) {
  const requests: ComputerRequest[] = [];

  const replies: Replies = {
    page: {
      kind: 'page' as const,
      ok: true as const,
      tab: 'g1',
      isDiskNew: false,
      hasChallenge: false,
      blocked: null,
      page: {
        url: 'https://site.test/form',
        status: 200,
        title: 'A form',
        text: 'Name [E1 textbox "Name"]',
        links: [],
      },
    },
    scroll: {
      kind: 'scroll' as const,
      ok: true as const,
      tab: 'g1',
      url: 'https://site.test/form',
      width: 1280,
      height: 800,
      isAtEnd: true,
      base64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    },
    shot: {
      kind: 'screenshot' as const,
      ok: true as const,
      tab: 'g1',
      url: 'https://site.test/form',
      width: 120,
      height: 30,
      hasChallenge: false,
      base64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    },
    desktop: {
      kind: 'desktop' as const,
      ok: true as const,
      width: 1280,
      height: 800,
      focus: { kind: 'browser' as const, tab: 'g1', url: 'https://site.test/form' },
      base64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    },
    screen: {
      kind: 'screen' as const,
      ok: true as const,
      focus: { kind: 'browser' as const, tab: 'g1', url: 'https://site.test/form' },
      base64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    },
    target: {
      kind: 'screen-target' as const,
      ok: true as const,
      target: {
        windowID: '0x1',
        kind: 'browser' as const,
        tab: 'g1',
        url: 'https://site.test/form',
      },
      base64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    },
    stale: { kind: 'failed' as const, ok: false as const, reason: 'stale_element' as const },
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

  const answerByOperation = (): ComputerHandler => (request) =>
    Promise.resolve(
      match(request.op)
        .with('desktopShot', () => replies.desktop)
        .with('screenScroll', 'screenAct', () => replies.screen)
        .with('screenBind', () => replies.target)
        .otherwise(() => replies.page),
    );

  const answer = (options.answer ?? answerByOperation)(replies);
  const copy = { isBlocked: false };

  const adapter = buildStubSandboxAdapter(
    async (stdin, stdout) => {
      await runComputerGuest(
        { input: stdin, write: (bytes) => stdout.write(bytes) },
        (request, askScan, askScanText) => {
          requests.push(request);

          return answer(request, askScan, askScanText);
        },
        10_000_000,
      );

      return 0;
    },
    { skipCopyIn: () => copy.isBlocked },
  );

  const computer = startComputer({
    adapter,
    image: 'computer-image',
    argv: ['guest'],
    scans: {
      scan: () => Promise.resolve({ kind: 'pass' as const }),
      scanText: () => Promise.resolve({ kind: 'pass' as const }),
    },
    deniedRanges: [],
    timeZone: 'UTC',
    logger: () => {},
    ...(options.turnWaitMs === undefined ? {} : { turnWaitMs: options.turnWaitMs }),
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
      imageLongEdge: options.imageLongEdge ?? 1568,
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
    copy,
    computer,

    // a sandbox of the earlier release whose disk the new one cannot copy while `copy` blocks it
    createOldBrowserSandbox: async () => {
      const old = await adapter.create(
        buildSandboxSpec({
          kind: 'browser',
          image: 'nixie-browser-old',
          owner: 'computer-browser',
          limits: { vcpus: 1, memoryMiB: 512, diskMiB: 8192 },
        }),
      );

      adapter.files.get(old.id)?.set('/home/stub/profile/Cookies', new Uint8Array([1, 2, 3]));
    },
    toolNames: built.tools.map((tool) => tool.name),
    requests,
    context,
    call: (name: string, input: Record<string, string | number | boolean>) =>
      findTool(name).run({ callID: 'call-1', tool: name, input, toolUseID: null }, context),
    prepare: (name: string, input: Record<string, string | number>) => {
      const prepare = findTool(name).prepare;

      invariant(prepare, `${name} has no prepare`);

      return prepare(input, context);
    },
    attempt: (
      tool: string,
      args: Record<string, string | number>,
      destinations: string[] = [],
      prepared: DirectResult | Prepared | null = null,
    ) =>
      built.connector.run({
        actionID: 'action-1',
        tool,
        arguments: args,
        attempt: 1,
        idempotencyKey: 'key',
        destinations,
        actionHash: buildActionHash({
          tool,
          input: args,
          destinations,
          deadlineAt: null,
          expectWindow:
            prepared !== null && 'expectWindow' in prepared ? prepared.expectWindow : undefined,
        }),
        deadlineAt: null,
      }),
  };
}

test('it opens a page in a tab the model can name and stores its text as a page', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });
  const outcome = await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

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

  const outcome = await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

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

  const outcome = await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  expect(outcome).toMatchObject({
    status: 'ok',
    refusalCode: 'SECRET_REFUSED',
    result: { refused: { code: 'SECRET_REFUSED' } },
  });
});

test('it refuses a read of a tab the browser does not hold', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });
  const outcome = await ctx.call('computer.browser_read', { tab: 't9', mode: 'text' });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'TAB_GONE' });
});

test('it prepares a click with the host of the tab as its destination and the URL it expects', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });

  await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  const prepared = await ctx.prepare('computer.browser_click', { tab: 't1', element: 'E1' });

  expect(prepared).toStrictEqual({
    destinations: ['site.test'],
    expectURL: 'https://site.test/form',
  });
});

test('it runs a queued click against the URL its preparation saw', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });

  await ctx.call('computer.browser_open', { url: 'https://site.test/form' });
  await ctx.prepare('computer.browser_click', { tab: 't1', element: 'E1' });

  const response = await ctx.attempt('computer.browser_click', { tab: 't1', element: 'E1' });

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

  await ctx.call('computer.browser_open', { url: 'https://site.test/form' });
  await ctx.prepare('computer.browser_click', { tab: 't1', element: 'E1' });

  const response = await ctx.attempt('computer.browser_click', { tab: 't1', element: 'E1' });

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

test('it offers the renamed browser tools and none under an old name', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });

  expect(ctx.toolNames).toStrictEqual([
    'computer.browser_open',
    'computer.browser_read',
    'computer.browser_screenshot',
    'computer.browser_scroll',
    'computer.browser_close',
    'computer.browser_download',
    'computer.browser_fill',
    'computer.browser_click',
    'computer.screenshot',
    'computer.screen_scroll',
    'computer.screen_click',
    'computer.screen_type',
    'computer.run',
    'computer.read_file',
    'computer.write_file',
    'computer.export_file',
    'computer.handover',
    'computer.handover_cancel',
    'computer.take_back',
  ]);
});

test.each(['computer.open', 'computer.read', 'computer.click'])(
  'it has no tool named %s',
  async (name) => {
    const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });

    expect(() => ctx.call(name, { tab: 't1' })).toThrow(`no tool ${name}`);
  },
);

test.each(['computer.fill', 'computer.click'])(
  'it settles a pending %s as TAB_GONE',
  async (tool) => {
    const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });
    const response = await ctx.attempt(tool, { tab: 't1', element: 'E1', value: 'x' });

    expect(response).toStrictEqual({
      kind: 'refused',
      reason: expect.stringContaining('tab is gone'),
    });
  },
);

test('it scrolls a tab and shows the viewport beside the result', async () => {
  const ctx = await setupTest({
    answer: (replies) => (request) => {
      const reply = request.op === 'scroll' ? replies.scroll : replies.page;

      return Promise.resolve(reply);
    },
  });

  await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  const outcome = await ctx.call('computer.browser_scroll', { tab: 't1', to: 'down' });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { tab: 't1', isAtEnd: true, isShown: true },
    images: [expect.objectContaining({ mediaType: 'image/png' })],
  });

  expect(ctx.requests.at(-1)).toStrictEqual({ op: 'scroll', tab: 'g1', to: 'down' });
});

test('it refuses a scroll to a control that moved', async () => {
  const ctx = await setupTest({
    answer: (replies) => (request) => {
      const reply = request.op === 'scroll' ? replies.stale : replies.page;

      return Promise.resolve(reply);
    },
  });

  await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  const outcome = await ctx.call('computer.browser_scroll', { tab: 't1', to: 'E9' });

  expect(outcome).toMatchObject({ refusalCode: 'STALE_ELEMENT' });
});

test('it refuses a scroll of a tab the browser does not hold', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });
  const outcome = await ctx.call('computer.browser_scroll', { tab: 't9', to: 'up' });

  expect(outcome).toMatchObject({ refusalCode: 'TAB_GONE' });
});

test('it asks for the picture of one control when the screenshot names it', async () => {
  const ctx = await setupTest({
    answer: (replies) => (request) => {
      const reply = request.op === 'screenshot' ? replies.shot : replies.page;

      return Promise.resolve(reply);
    },
  });

  await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  const outcome = await ctx.call('computer.browser_screenshot', { tab: 't1', control: 'E1' });

  expect(outcome).toMatchObject({
    result: { tab: 't1', width: 120, height: 30, isShown: true },
  });

  expect(ctx.requests.at(-1)).toStrictEqual({ op: 'screenshot', tab: 'g1', control: 'E1' });
});

test('it refuses a screenshot of a control that moved', async () => {
  const ctx = await setupTest({
    answer: (replies) => (request) => {
      const reply = request.op === 'screenshot' ? replies.stale : replies.page;

      return Promise.resolve(reply);
    },
  });

  await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  const outcome = await ctx.call('computer.browser_screenshot', { tab: 't1', control: 'E9' });

  expect(outcome).toMatchObject({ refusalCode: 'STALE_ELEMENT' });
});

test.each([
  'computer.browser_open',
  'computer.browser_read',
  'computer.browser_screenshot',
  'computer.browser_scroll',
  'computer.browser_close',
  'computer.browser_download',
  'computer.run',
  'computer.read_file',
  'computer.write_file',
  'computer.export_file',
])('it answers COMPUTER_MOVING from %s while the move has not succeeded', async (name) => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });

  await ctx.createOldBrowserSandbox();

  ctx.copy.isBlocked = true;

  const outcome = await ctx.call(name, {
    url: 'https://site.test/',
    tab: 't1',
    element: 'E1',
    path: 'a.txt',
    text: 'x',
    command: 'ls',
  });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { refused: { code: 'COMPUTER_MOVING' } },
  });
});

test.each(['computer.browser_click', 'computer.browser_fill'])(
  'it answers COMPUTER_MOVING when %s is prepared while the move has not succeeded',
  async (name) => {
    const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });

    await ctx.createOldBrowserSandbox();

    ctx.copy.isBlocked = true;

    const prepared = await ctx.prepare(name, { tab: 't1', element: 'E1', value: 'x' });

    expect(prepared).toMatchObject({ result: { refused: { code: 'COMPUTER_MOVING' } } });
  },
);

test('it settles a queued command as retryable while the move has not succeeded', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.run) });

  await ctx.createOldBrowserSandbox();

  ctx.copy.isBlocked = true;

  const outcome = await ctx.attempt('computer.run', { command: 'ls' });

  expect(outcome).toMatchObject({ kind: 'refused_retryable' });
});

test('it settles a queued command with no remembered preparation as TAB_GONE', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.run) });
  const outcome = await ctx.attempt('computer.run', { command: 'ls' });

  expect(outcome).toMatchObject({ kind: 'refused', reason: expect.stringContaining('replaced') });
});

test.each(['computer.browser_click', 'computer.browser_fill'])(
  'it settles a queued %s of an earlier release as TAB_GONE',
  async (tool) => {
    const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });
    const outcome = await ctx.attempt(tool, { tab: 't9', element: 'E1', value: 'x' });

    expect(outcome).toMatchObject({
      kind: 'refused',
      reason: expect.stringContaining('no tab t9'),
    });
  },
);

test('it takes a desktop screenshot that names the focused tab and says nobody watches', async () => {
  const picture = await encodeTestImage({ width: 1280, height: 800 }, 'png');

  const ctx = await setupTest({
    answer: (replies) => (request) => {
      const shot = { ...replies.desktop, base64: Buffer.from(picture).toString('base64') };
      const reply = request.op === 'desktopShot' ? shot : replies.page;

      return Promise.resolve(reply);
    },
  });

  await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  const outcome = await ctx.call('computer.screenshot', {});

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      width: 1280,
      height: 800,
      focus: { kind: 'browser', tab: 't1', url: 'https://site.test/form' },
      isWatched: false,
      isShown: true,
    },
    images: [expect.anything()],
  });
});

test('it says in a desktop screenshot that the user is watching while a watch is open', async () => {
  const picture = await encodeTestImage({ width: 1280, height: 800 }, 'png');

  const ctx = await setupTest({
    answer: (replies) => () =>
      Promise.resolve({ ...replies.desktop, base64: Buffer.from(picture).toString('base64') }),
  });

  const connection = ctx.computer.watch({ send: () => {}, close: () => {} }, 'laptop');

  const watched = await ctx.call('computer.screenshot', {});

  connection.end();

  const unwatched = await ctx.call('computer.screenshot', {});

  expect([watched, unwatched]).toMatchObject([
    { result: { isWatched: true } },
    { result: { isWatched: false } },
  ]);
});

test('it reports the size of the picture the model sees when the image limit shrinks it', async () => {
  const picture = await encodeTestImage({ width: 1280, height: 800 }, 'png');

  const ctx = await setupTest({
    imageLongEdge: 800,
    answer: (replies) => () =>
      Promise.resolve({ ...replies.desktop, base64: Buffer.from(picture).toString('base64') }),
  });

  const outcome = await ctx.call('computer.screenshot', {});

  expect(outcome).toMatchObject({ status: 'ok', result: { width: 800, height: 500 } });
});

test('it names a focused tab that the model has no ID for with the next ID', async () => {
  const ctx = await setupTest({});
  const outcome = await ctx.call('computer.screenshot', {});

  expect(outcome).toMatchObject({
    result: { focus: { kind: 'browser', tab: 't1', url: 'https://site.test/form' } },
  });
});

test('it scrolls the screen and says nobody watches', async () => {
  const ctx = await setupTest({});

  await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  const outcome = await ctx.call('computer.screen_scroll', { x: 640, y: 400, by: -5 });

  expect([outcome, ctx.requests.at(-1)]).toMatchObject([
    {
      status: 'ok',
      result: {
        focus: { kind: 'browser', tab: 't1', url: 'https://site.test/form' },
        isWatched: false,
      },
    },
    { op: 'screenScroll', x: 640, y: 400, by: -5 },
  ]);
});

test.each([
  [{ x: 1280, y: 10, by: 1 }, 'BAD_POINT'],
  [{ x: 10, y: 800, by: 1 }, 'BAD_POINT'],
  [{ x: -1, y: 10, by: 1 }, 'BAD_POINT'],
  [{ x: 10, y: 10, by: 0 }, 'BAD_STEPS'],
  [{ x: 10, y: 10, by: 51 }, 'BAD_STEPS'],
  [{ x: 10, y: 10, by: -51 }, 'BAD_STEPS'],
])('it refuses the scroll %p with %s', async (input, code) => {
  const ctx = await setupTest({});
  const outcome = await ctx.call('computer.screen_scroll', input);

  expect([outcome, ctx.requests]).toMatchObject([{ refusalCode: code }, []]);
});

test('it prepares a click on a browser window with the tab host as its destination', async () => {
  const ctx = await setupTest({});
  const prepared = await ctx.prepare('computer.screen_click', { x: 412, y: 233, button: 'left' });

  expect(prepared).toStrictEqual({
    destinations: ['site.test'],
    expectWindow: {
      windowID: '0x1',
      kind: 'browser',
      tab: 'g1',
      url: 'https://site.test/form',
      picture: expect.stringMatching(/^[\da-f]{64}$/u),
    },
    attachments: [expect.any(Uint8Array)],
  });
});

test('it prepares a click on another window with no destination', async () => {
  const ctx = await setupTest({
    answer: (replies) => (request) => {
      const other = { ...replies.target, target: { windowID: '0x7', kind: 'other' as const } };
      const reply = request.op === 'screenBind' ? other : replies.page;

      return Promise.resolve(reply);
    },
  });

  const prepared = await ctx.prepare('computer.screen_click', { x: 412, y: 233, button: 'left' });

  expect(prepared).toStrictEqual({
    destinations: [],
    expectWindow: {
      windowID: '0x7',
      kind: 'other',
      picture: expect.stringMatching(/^[\da-f]{64}$/u),
    },
    attachments: [expect.any(Uint8Array)],
  });
});

test('it prepares a type with no picture, whatever the guest sends beside the window', async () => {
  const ctx = await setupTest({});
  const prepared = await ctx.prepare('computer.screen_type', { text: 'hello' });

  expect(prepared).toStrictEqual({
    destinations: ['site.test'],
    expectWindow: { windowID: '0x1', kind: 'browser', tab: 'g1', url: 'https://site.test/form' },
  });
});

test('it refuses to prepare a click outside the screen without asking the guest', async () => {
  const ctx = await setupTest({});
  const prepared = await ctx.prepare('computer.screen_click', { x: 2000, y: 5, button: 'left' });

  expect([prepared, ctx.requests]).toMatchObject([{ refusalCode: 'BAD_POINT' }, []]);
});

test.each([
  ['use_run', 'USE_RUN'],
  ['use_browser_open', 'USE_BROWSER_OPEN'],
] as const)(
  'it refuses to prepare a click that the guest refuses with %s',
  async (reason, code) => {
    const ctx = await setupTest({
      answer: () => () => Promise.resolve({ kind: 'failed', ok: false, reason, message: 'use it' }),
    });

    const prepared = await ctx.prepare('computer.screen_click', { x: 5, y: 5, button: 'left' });

    expect(prepared).toMatchObject({
      refusalCode: code,
      result: { refused: { message: 'use it' } },
    });
  },
);

test('it runs a queued click against the window its preparation saw', async () => {
  const ctx = await setupTest({});

  const input = { x: 412, y: 233, button: 'right' };

  const prepared = await ctx.prepare('computer.screen_click', input);
  const response = await ctx.attempt('computer.screen_click', input, ['site.test'], prepared);

  expect([response, ctx.requests.at(-1)]).toStrictEqual([
    {
      kind: 'success',
      result: {
        focus: { kind: 'browser', tab: 't1', url: 'https://site.test/form' },
        isWatched: false,
        isShown: true,
      },
      images: [{ mediaType: 'image/png', bytes: expect.any(Uint8Array) }],
    },
    {
      op: 'screenAct',
      binding: { windowID: '0x1', kind: 'browser', tab: 'g1', url: 'https://site.test/form' },
      act: { kind: 'click', x: 412, y: 233, button: 'right' },
    },
  ]);
});

test('it refuses a queued click with SCREEN_CHANGED when no preparation is remembered', async () => {
  const ctx = await setupTest({});
  const response = await ctx.attempt('computer.screen_click', { x: 1, y: 2, button: 'left' });

  expect([response, ctx.requests]).toStrictEqual([
    { kind: 'refused', reason: expect.stringContaining('restarted') },
    [],
  ]);
});

test('it refuses a queued click when the guest says the window moved', async () => {
  const ctx = await setupTest({
    answer: (replies) => (request) => {
      const moved = {
        kind: 'failed' as const,
        ok: false as const,
        reason: 'screen_changed' as const,
        message: 'another window is there',
      };

      const reply = request.op === 'screenAct' ? moved : replies.target;

      return Promise.resolve(reply);
    },
  });

  const input = { x: 1, y: 2, button: 'left' };

  const prepared = await ctx.prepare('computer.screen_click', input);
  const response = await ctx.attempt('computer.screen_click', input, ['site.test'], prepared);

  expect(response).toStrictEqual({
    kind: 'refused',
    reason: 'another window is there',
  });
});

test.each([
  [{ text: 'hello' }, { kind: 'text', text: 'hello' }],
  [{ keys: 'shift+tab' }, { kind: 'keys', keys: 'shift+tab' }],
])('it runs a queued type of %p', async (input, act) => {
  const ctx = await setupTest({});
  const prepared = await ctx.prepare('computer.screen_type', input);
  const response = await ctx.attempt('computer.screen_type', input, ['site.test'], prepared);

  expect([response.kind, ctx.requests.at(-1)]).toMatchObject(['success', { op: 'screenAct', act }]);
});

test('it returns the picture of the desktop after a queued type beside its result', async () => {
  const ctx = await setupTest({});

  const input = { keys: 'enter' };

  const prepared = await ctx.prepare('computer.screen_type', input);
  const response = await ctx.attempt('computer.screen_type', input, ['site.test'], prepared);

  expect(response).toStrictEqual({
    kind: 'success',
    result: {
      focus: { kind: 'browser', tab: 't1', url: 'https://site.test/form' },
      isWatched: false,
      isShown: true,
    },
    images: [{ mediaType: 'image/png', bytes: expect.any(Uint8Array) }],
  });
});

test.each([[{ text: 'a', keys: 'enter' }], [{}]])(
  'it refuses to prepare a type of %p',
  async (input) => {
    const ctx = await setupTest({});
    const prepared = await ctx.prepare('computer.screen_type', input);

    expect([prepared, ctx.requests]).toMatchObject([{ refusalCode: expect.any(String) }, []]);
  },
);

test('it refuses a queued screen act whose allowed host is not the one its binding saw', async () => {
  const ctx = await setupTest({});

  const input = { keys: 'enter' };

  const prepared = await ctx.prepare('computer.screen_type', input);
  const response = await ctx.attempt('computer.screen_type', input, ['other.test'], prepared);

  expect([response, ctx.requests.at(-1)?.op]).toStrictEqual([
    { kind: 'refused', reason: expect.stringContaining('not the one the owner allowed') },
    'screenBind',
  ]);
});

test('it runs the click each approval answers when 2 preparations share an input', async () => {
  let windowID = '0x1';

  const ctx = await setupTest({
    answer: (replies) => (request) => {
      const bound = { ...replies.target, target: { ...replies.target.target, windowID } };
      const reply = request.op === 'screenBind' ? bound : replies.screen;

      return Promise.resolve(reply);
    },
  });

  const input = { x: 412, y: 233, button: 'left' };

  const first = await ctx.prepare('computer.screen_click', input);

  windowID = '0x2';

  const second = await ctx.prepare('computer.screen_click', input);

  await ctx.attempt('computer.screen_click', input, ['site.test'], first);

  const response = await ctx.attempt('computer.screen_click', input, ['site.test'], second);

  expect([
    response.kind,
    ctx.requests.filter((request) => request.op === 'screenAct'),
  ]).toMatchObject([
    'success',
    [{ binding: { windowID: '0x1' } }, { binding: { windowID: '0x2' } }],
  ]);
});

test('it refuses a click whose window and picture the owner never answered', async () => {
  const ctx = await setupTest({});

  const input = { x: 412, y: 233, button: 'left' };

  await ctx.prepare('computer.screen_click', input);

  const response = await ctx.attempt('computer.screen_click', input, ['site.test']);

  expect([response, ctx.requests.at(-1)?.op]).toStrictEqual([
    { kind: 'refused', reason: expect.stringContaining('restarted') },
    'screenBind',
  ]);
});

test('it keeps the binding of a queued click while the computer is busy, so a retry runs it', async () => {
  const gate = Promise.withResolvers<void>();

  const ctx = await setupTest({
    turnWaitMs: 20,
    answer: (replies) => async (request) => {
      if (request.op === 'screenBind') {
        return replies.target;
      }

      if (request.op === 'screenAct') {
        return replies.screen;
      }

      await gate.promise;

      return replies.page;
    },
  });

  const input = { x: 412, y: 233, button: 'left' };

  const prepared = await ctx.prepare('computer.screen_click', input);

  const opening = ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  await waitFor(() => ctx.requests.some((request) => request.op !== 'screenBind'));

  const busy = await ctx.attempt('computer.screen_click', input, ['site.test'], prepared);

  gate.resolve();

  await opening;

  const retried = await ctx.attempt('computer.screen_click', input, ['site.test'], prepared);

  expect([busy.kind, retried.kind]).toStrictEqual(['refused_retryable', 'success']);
});

test('it reports a queued click done with no picture when the desktop could not be captured', async () => {
  const ctx = await setupTest({
    answer: (replies) => (request) => {
      const { base64: _omitted, ...bare } = replies.screen;
      const reply = request.op === 'screenBind' ? replies.target : bare;

      return Promise.resolve(reply);
    },
  });

  const input = { x: 412, y: 233, button: 'left' };

  const prepared = await ctx.prepare('computer.screen_click', input);
  const response = await ctx.attempt('computer.screen_click', input, ['site.test'], prepared);

  expect(response).toStrictEqual({
    kind: 'success',
    result: {
      focus: { kind: 'browser', tab: 't1', url: 'https://site.test/form' },
      isWatched: false,
      isShown: false,
    },
  });
});

test('it refuses a direct change of the desktop while a device holds it, and opens no page', async () => {
  const ctx = await setupTest({});

  await ctx.computer.takeover.start('laptop');

  const outcome = await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  expect([outcome, ctx.requests]).toMatchObject([
    { refusalCode: 'TAKEN_OVER' },
    [{ op: 'takeoverBegin' }],
  ]);
});

test('it refuses a direct change of the desktop while a take-over waits for an admitted call', async () => {
  const ctx = await setupTest({});

  const admission = ctx.computer.takeover.admit();

  onTestFinished(() => {
    admission?.release();
  });

  void ctx.computer.takeover.start('laptop');

  const outcome = await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  expect([outcome, ctx.requests]).toMatchObject([{ refusalCode: 'TAKEN_OVER' }, []]);
});

test('it runs a direct change inside an admitted call while a take-over waits for it', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });

  const admission = ctx.computer.takeover.admit();

  invariant(admission, 'no hold is open');

  onTestFinished(() => {
    admission.release();
  });

  void ctx.computer.takeover.start('laptop');

  const outcome = await admission.run(() =>
    ctx.call('computer.browser_open', { url: 'https://site.test/form' }),
  );

  expect(outcome).toMatchObject({ status: 'ok', result: { tab: 't1' } });
});

test('it runs a queued command inside an admitted call while a take-over waits for it', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.run) });

  await ctx.prepare('computer.run', { command: 'ls' });

  const admission = ctx.computer.takeover.admit();

  invariant(admission, 'no hold is open');

  onTestFinished(() => {
    admission.release();
  });

  void ctx.computer.takeover.start('laptop');

  const outcome = await admission.run(() => ctx.attempt('computer.run', { command: 'ls' }));

  expect(outcome).toMatchObject({ kind: 'success', result: { exitCode: 0 } });
});

test('it reads the desktop while a device holds it', async () => {
  const ctx = await setupTest({});

  await ctx.computer.takeover.start('laptop');

  const outcome = await ctx.call('computer.screenshot', {});

  expect(outcome).toMatchObject({ status: 'ok', images: [expect.anything()] });
});

test('it opens a page again once the device hands the desktop back', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });

  await ctx.computer.takeover.start('laptop');
  await ctx.computer.takeover.end('user', 'laptop');

  const outcome = await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  expect(outcome).toMatchObject({ status: 'ok', result: { tab: 't1' } });
});

test('it settles a queued command as retryable while a device holds the desktop', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.run) });

  await ctx.prepare('computer.run', { command: 'ls' });
  await ctx.computer.takeover.start('laptop');

  const outcome = await ctx.attempt('computer.run', { command: 'ls' });

  expect(outcome).toMatchObject({ kind: 'refused_retryable' });
});

test('it refuses a waiting command after a hold on the desktop came and went', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.run) });

  await ctx.prepare('computer.run', { command: 'ls' });
  await ctx.computer.takeover.start('laptop');
  await ctx.computer.takeover.end('user', 'laptop');

  const outcome = await ctx.attempt('computer.run', { command: 'ls' });

  expect(outcome).toMatchObject({
    kind: 'refused',
    reason: expect.stringContaining('files changed'),
  });
});

test('it refuses a waiting click after a hold on the desktop came and went', async () => {
  const ctx = await setupTest({});

  const input = { x: 412, y: 233, button: 'left' };

  const prepared = await ctx.prepare('computer.screen_click', input);

  await ctx.computer.takeover.start('laptop');
  await ctx.computer.takeover.end('user', 'laptop');

  const outcome = await ctx.attempt('computer.screen_click', input, ['site.test'], prepared);

  expect(outcome).toMatchObject({
    kind: 'refused',
    reason: expect.stringContaining('screen may have changed'),
  });
});

test('it opens a handover ask with a reason, and refuses a second one while it stands', async () => {
  const ctx = await setupTest({});
  const first = await ctx.call('computer.handover', { reason: 'itch.io asks for a CAPTCHA' });
  const second = await ctx.call('computer.handover', { reason: 'again' });

  expect([first, second]).toMatchObject([
    { status: 'ok', result: { asked: true } },
    { status: 'ok', refusalCode: 'ALREADY_ASKED' },
  ]);
});

test('it refuses a handover ask while the user holds the computer', async () => {
  const ctx = await setupTest({});

  await ctx.computer.takeover.start('laptop');

  const outcome = await ctx.call('computer.handover', { reason: 'a CAPTCHA' });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'TAKEN_OVER' });
});

test('it refuses an empty handover reason', async () => {
  const ctx = await setupTest({});

  expect(() => ctx.call('computer.handover', { reason: '' })).toThrow();
});

test('it cancels a standing ask, and refuses a cancel when none stands', async () => {
  const ctx = await setupTest({});
  const none = await ctx.call('computer.handover_cancel', {});

  await ctx.call('computer.handover', { reason: 'a CAPTCHA' });

  const cancelled = await ctx.call('computer.handover_cancel', {});
  const again = await ctx.call('computer.handover', { reason: 'a CAPTCHA again' });

  expect([none, cancelled, again]).toMatchObject([
    { status: 'ok', refusalCode: 'NOT_ASKED' },
    { status: 'ok', result: { cancelled: true } },
    { status: 'ok', result: { asked: true } },
  ]);
});

test('it refuses a take-back when the user holds nothing', async () => {
  const ctx = await setupTest({});
  const outcome = await ctx.call('computer.take_back', {});

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'NOT_TAKEN_OVER' });
});

test('it takes the computer back from the user at once and lets the assistant act again', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });

  await ctx.computer.takeover.start('laptop');

  const outcome = await ctx.call('computer.take_back', {});
  const opened = await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  expect([outcome, ctx.computer.takeover.isHeld(), opened]).toMatchObject([
    { status: 'ok', result: { durationSeconds: expect.any(Number) } },
    false,
    { status: 'ok', result: { tab: 't1' } },
  ]);
});

test('it ends the ask when the user takes over', async () => {
  const ctx = await setupTest({});

  await ctx.call('computer.handover', { reason: 'a CAPTCHA' });
  await ctx.computer.takeover.start('laptop');
  await ctx.computer.takeover.end('user', 'laptop');

  const outcome = await ctx.call('computer.handover_cancel', {});

  expect(outcome).toMatchObject({ refusalCode: 'NOT_ASKED' });
});

test('it carries a line outside the page text when an opened tab shows a challenge', async () => {
  const ctx = await setupTest({
    answer: (replies) => () => Promise.resolve({ ...replies.page, hasChallenge: true }),
  });

  const outcome = await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      text: 'Name [E1 textbox "Name"]',
      challenge: expect.stringContaining('call computer.handover with a reason'),
    },
  });
});

test('it carries the challenge line on a read and a screenshot of a tab that shows one', async () => {
  const ctx = await setupTest({
    answer: (replies) => (request) => {
      const reply =
        request.op === 'screenshot'
          ? { ...replies.shot, hasChallenge: true }
          : { ...replies.page, hasChallenge: request.op === 'read' };

      return Promise.resolve(reply);
    },
  });

  const opened = await ctx.call('computer.browser_open', { url: 'https://site.test/form' });
  const read = await ctx.call('computer.browser_read', { tab: 't1', mode: 'text' });
  const shot = await ctx.call('computer.browser_screenshot', { tab: 't1' });

  expect([opened, read, shot]).toMatchObject([
    { result: { tab: 't1' } },
    { result: { challenge: expect.stringContaining('A person must solve it') } },
    { result: { challenge: expect.stringContaining('A person must solve it') } },
  ]);

  expect(opened).not.toHaveProperty('result.challenge');
});

test('it carries no challenge line for a page that shows none', async () => {
  const ctx = await setupTest({ answer: (replies) => () => Promise.resolve(replies.page) });
  const outcome = await ctx.call('computer.browser_open', { url: 'https://site.test/form' });

  expect(outcome).not.toHaveProperty('result.challenge');
});

test('it tells the tab with a challenge from the tab without when the model reads each', async () => {
  const opens = { count: 0 };

  const ctx = await setupTest({
    answer: (replies) => (request) => {
      if (request.op === 'open') {
        opens.count += 1;

        return Promise.resolve({ ...replies.page, tab: `g${String(opens.count)}` });
      }

      return Promise.resolve({
        ...replies.page,
        tab: request.op === 'read' ? request.tab : 'g1',
        hasChallenge: request.op === 'read' && request.tab === 'g2',
      });
    },
  });

  await ctx.call('computer.browser_open', { url: 'https://one.test/' });
  await ctx.call('computer.browser_open', { url: 'https://two.test/' });

  const first = await ctx.call('computer.browser_read', { tab: 't1', mode: 'text' });
  const second = await ctx.call('computer.browser_read', { tab: 't2', mode: 'text' });

  expect(first).not.toHaveProperty('result.challenge');
  expect(second).toHaveProperty('result.challenge');
});
