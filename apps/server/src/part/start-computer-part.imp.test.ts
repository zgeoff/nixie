import { expect, onTestFinished, test } from 'bun:test';
import { startComputer } from '@heynixie/connectors';
import { buildSandboxSpec } from '@heynixie/sandbox';
import { buildImpPort, buildImpSandboxAdapter, parseImpConfig } from '@heynixie/sandbox-imp';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import type { ComputerReply, ComputerRequest, ScreenBinding } from '@heynixie/wire';
import { waitFor } from '@zgeoff/testing';
import invariant from 'tiny-invariant';
import { buildButtonPageURL } from '../test-utils/build-button-page-url';

// These tests need a real impd on a host with /dev/kvm and the computer image built into it.
// docs/runbooks/imp-isolation-tests.md names the variables that turn them on. CI skips them, so a
// person runs them by hand.
const hasImpHost =
  process.env['NIXIE_IMP_TEST_URL'] !== undefined &&
  process.env['NIXIE_IMP_TEST_TOKEN'] !== undefined &&
  process.env['NIXIE_IMP_TEST_HOST_ADDRESSES'] !== undefined &&
  (process.env['NIXIE_IMP_TEST_COMPUTER_IMAGE'] ?? '') !== '';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  // onTestFinished runs its callbacks first in, first out, so a sandbox on the stack is destroyed
  // while the recorder's writer still runs.
  onTestFinished(() => stack.disposeAsync());

  const testRecorder = await setupTestRecorder();

  const config = parseImpConfig({
    IMP_URL: process.env['NIXIE_IMP_TEST_URL'],
    IMP_TOKEN: process.env['NIXIE_IMP_TEST_TOKEN'],
    IMP_HOST_ADDRESSES: process.env['NIXIE_IMP_TEST_HOST_ADDRESSES'],
    IMP_EGRESS_DENY: process.env['NIXIE_IMP_TEST_EGRESS_DENY'],
  });

  const adapter = buildImpSandboxAdapter({
    port: buildImpPort(config),
    recorder: testRecorder.recorder,
    config,
    toolTarget: () => ({ path: '/nonexistent.sock' }),
  });

  const image = process.env['NIXIE_IMP_TEST_COMPUTER_IMAGE'] ?? '';

  const computer = startComputer({
    adapter,
    image,
    argv: ['/usr/local/bin/bun', '/app/computer.js'],
    homeEnv: { HOME: '/home/computer' },
    legacyHomeEnv: { HOME: '/home/bun' },
    deniedRanges: [
      ...(config.publicEgress?.hostAddresses ?? []),
      ...(config.publicEgress?.egressDeny ?? []),
    ],
    timeZone: 'UTC',
    scans: {
      scan: () => Promise.resolve({ kind: 'pass' }),
      scanText: () => Promise.resolve({ kind: 'pass' }),
    },
    logger: () => {},
  });

  stack.defer(() => computer.reset());

  const callComputer = (request: ComputerRequest) =>
    computer.call({
      request,
      scan: () => Promise.resolve({ kind: 'pass' }),
      scanText: () => Promise.resolve({ kind: 'pass' }),
      timeoutMs: 120_000,
    });

  const runCommand = (command: string) =>
    callComputer({ op: 'run', argv: ['bash', '-c', command], timeoutSeconds: 60 });

  // A sandbox that stands in for one of the earlier release, on the computer image, with the files
  // that the earlier guest kept in the home of its user.
  const createOldSandbox = async (kind: 'browser' | 'shell', files: Record<string, string>) => {
    const sandbox = await adapter.create(
      buildSandboxSpec({
        kind,
        image,
        owner: `computer-${kind}`,
        limits: { vcpus: 1, memoryMiB: 512, diskMiB: 8192 },
      }),
    );

    await sandbox.copyIn(
      Object.entries(files).map(([path, text]) => ({
        path,
        content: new TextEncoder().encode(text),
      })),
    );

    return sandbox;
  };

  const send = async (request: ComputerRequest): Promise<ComputerReply> => {
    const result = await computer.call({
      request,
      scan: () => Promise.resolve({ kind: 'pass' }),
      scanText: () => Promise.resolve({ kind: 'pass' }),
      timeoutMs: 120_000,
    });

    invariant(result.status === 'reply', 'the computer answered');

    return result.reply;
  };

  const openPage = (title: string) =>
    send({
      op: 'open',
      url: buildButtonPageURL(title),
      limits: {
        bodyBytes: 1_000_000,
        timeoutMs: 30_000,
        redirects: 5,
        textBytes: 20_000,
        imageBytes: 0,
      },
      deniedRanges: [],
    });

  const readTitle = async (): Promise<string | null> => {
    const reply = await send({ op: 'read', tab: 't1', mode: 'text' });

    return reply.kind === 'page' ? reply.page.title : null;
  };

  const bind = async (x: number, y: number): Promise<ScreenBinding> => {
    const reply = await send({
      op: 'screenBind',
      act: { kind: 'click', x, y, button: 'left' },
    });

    invariant(reply.kind === 'screen-target', 'the click bound to a window');

    return reply.target;
  };

  return {
    adapter,
    computer,
    runCommand,
    callComputer,
    createOldSandbox,
    send,
    openPage,
    readTitle,
    bind,
  };
}

test.skipIf(!hasImpHost)(
  'it runs a command in a network namespace with a loopback and nothing else',
  async () => {
    const ctx = await setupTest();
    const result = await ctx.runCommand('cat /proc/net/dev | tail -n +3 | cut -d: -f1 | tr -d " "');

    expect(result).toMatchObject({
      status: 'reply',
      reply: { kind: 'run', run: { exitCode: 0, stdout: { text: 'lo\n' } } },
    });
  },
);

test.skipIf(!hasImpHost)(
  'it gives a command no route to the display, which listens on an abstract socket alone',
  async () => {
    const ctx = await setupTest();

    const result = await ctx.runCommand(
      'ls /tmp/.X11-unix | wc -l; grep -c "@/tmp/.X11-unix" /proc/net/unix',
    );

    expect(result).toMatchObject({
      status: 'reply',
      reply: { kind: 'run', run: { stdout: { text: '0\n0\n' } } },
    });
  },
);

test.skipIf(!hasImpHost)('it refuses a tunnel that a command opens', async () => {
  const ctx = await setupTest();

  const result = await ctx.runCommand(
    "curl -s -o /dev/null -w '%{http_code}' https://example.com/; true",
  );

  expect(result).toMatchObject({
    status: 'reply',
    reply: { kind: 'run', run: { stdout: { text: '000' } } },
  });
});

test.skipIf(!hasImpHost)(
  'it keeps the profile from the terminal and gives a command another user than Chromium',
  async () => {
    const ctx = await setupTest();

    await ctx.callComputer({
      op: 'open',
      url: 'https://example.com/',
      limits: {
        bodyBytes: 1_000_000,
        timeoutMs: 30_000,
        redirects: 5,
        textBytes: 20_000,
        imageBytes: 0,
      },
      deniedRanges: [],
    });

    const result = await ctx.runCommand(
      [
        'stat -c %a /home/computer/profile',
        'ls /home/computer/profile > /dev/null 2>&1; echo "list=$?"',

        // A bare pattern matches this command's own bash line, which the terminal may trace, so the
        // bracket keeps the match to Chromium's processes.
        'pids=$(pgrep -f "chrome-linux64/[c]hrome")',
        '[ -n "$pids" ] && echo found',
        'for pid in $pids; do kill -0 "$pid" 2>/dev/null && echo signalled; done; echo done',
        'for pid in $pids; do cat /proc/$pid/environ > /dev/null 2>&1 && echo traced; done; echo done',
      ].join('; '),
    );

    expect(result).toMatchObject({
      status: 'reply',
      reply: { kind: 'run', run: { stdout: { text: '700\nlist=2\nfound\ndone\ndone\n' } } },
    });
  },
);

test.skipIf(!hasImpHost)(
  'it holds every command and the terminal to one memory limit of 512 MiB',
  async () => {
    const ctx = await setupTest();

    const result = await ctx.runCommand(
      'cat /proc/self/cgroup /sys/fs/cgroup/nixie-terminal/memory.max /sys/fs/cgroup/nixie-terminal/memory.swap.max',
    );

    expect(result).toMatchObject({
      status: 'reply',
      reply: { kind: 'run', run: { stdout: { text: '0::/nixie-terminal\n536870912\n0\n' } } },
    });
  },
);

test.skipIf(!hasImpHost)(
  'it moves the profile with its sign-ins and the files of the earlier release into the computer, and destroys the old sandboxes',
  async () => {
    const ctx = await setupTest();

    await ctx.createOldSandbox('browser', {
      '/home/bun/profile/Default/Cookies': 'session=ada',
      '/home/bun/profile/Local State': '{"signed":"in"}',
    });

    await ctx.createOldSandbox('shell', {
      '/home/bun/files/notes/tides.md': 'high at six',
    });

    const files = await ctx.callComputer({ op: 'readFile', path: 'notes/tides.md' });
    const listed = await ctx.adapter.list('computer-desktop');
    const keptBrowsers = await ctx.adapter.list('computer-browser');
    const keptShells = await ctx.adapter.list('computer-shell');

    const [sandbox] = listed;

    const cookies = await sandbox?.copyOut(['/home/computer/profile/Default/Cookies']);

    expect(files).toMatchObject({
      status: 'reply',
      reply: {
        kind: 'file',
        base64: Buffer.from('high at six').toString('base64'),
        isDiskNew: false,
      },
    });

    expect(cookies?.map((file) => new TextDecoder().decode(file.content))).toStrictEqual([
      'session=ada',
    ]);

    expect([keptBrowsers, keptShells]).toStrictEqual([[], []]);
  },
);

test.skipIf(!hasImpHost)('it takes a 1280 by 800 picture of the desktop', async () => {
  const ctx = await setupTest();
  const reply = await ctx.send({ op: 'desktopShot' });

  invariant(reply.kind === 'desktop', 'the reply is a desktop picture');

  const bytes = Buffer.from(reply.base64, 'base64');

  expect({
    isPNG: bytes.subarray(1, 4).toString('latin1') === 'PNG',
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }).toStrictEqual({ isPNG: true, width: 1280, height: 800 });
});

test.skipIf(!hasImpHost)(
  'it clicks a point on a page in Chromium and the page reacts',
  async () => {
    const ctx = await setupTest();

    await ctx.openPage('before');

    const binding = await ctx.bind(640, 500);

    const reply = await ctx.send({
      op: 'screenAct',
      binding,
      act: { kind: 'click', x: 640, y: 500, button: 'left' },
    });

    expect(reply).toMatchObject({ kind: 'screen', focus: { kind: 'browser', tab: 't1' } });

    await waitFor(async () => (await ctx.readTitle()) === 'clicked');
  },
);

test.skipIf(!hasImpHost)(
  'it refuses a screen act on the terminal window with USE_RUN',
  async () => {
    const ctx = await setupTest();

    // Chromium opens over the whole display, so alt+tab brings the terminal, at 24, 24, to the front.
    const chord = { kind: 'keys', keys: 'alt+tab' } as const;

    const browser = await ctx.send({ op: 'screenBind', act: chord });

    invariant(browser.kind === 'screen-target', 'the chord bound to a window');

    await ctx.send({ op: 'screenAct', binding: browser.target, act: chord });

    const reply = await ctx.send({
      op: 'screenBind',
      act: { kind: 'click', x: 100, y: 100, button: 'left' },
    });

    expect(reply).toMatchObject({ kind: 'failed', reason: 'use_run' });
  },
);

test.skipIf(!hasImpHost)(
  'it refuses a click on the address bar of the browser with USE_BROWSER_OPEN',
  async () => {
    const ctx = await setupTest();

    await ctx.openPage('before');

    const reply = await ctx.send({
      op: 'screenBind',
      act: { kind: 'click', x: 640, y: 50, button: 'left' },
    });

    expect(reply).toMatchObject({ kind: 'failed', reason: 'use_browser_open' });
  },
);

test.skipIf(!hasImpHost)(
  'it refuses a click with SCREEN_CHANGED when the window under the point changed',
  async () => {
    const ctx = await setupTest();

    await ctx.openPage('first');

    const binding = await ctx.bind(640, 500);

    await ctx.openPage('second');

    const reply = await ctx.send({
      op: 'screenAct',
      binding,
      act: { kind: 'click', x: 640, y: 500, button: 'left' },
    });

    expect(reply).toMatchObject({ kind: 'failed', reason: 'screen_changed' });
  },
);
