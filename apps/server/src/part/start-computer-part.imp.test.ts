import { expect, onTestFinished, test } from 'bun:test';
import { startComputer } from '@heynixie/connectors';
import { buildSandboxSpec } from '@heynixie/sandbox';
import { buildImpPort, buildImpSandboxAdapter, parseImpConfig } from '@heynixie/sandbox-imp';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import type { ComputerReply, ComputerRequest, ScreenBinding } from '@heynixie/wire';
import { waitFor } from '@zgeoff/testing';
import invariant from 'tiny-invariant';
import { buildButtonPageURL } from '../test-utils/build-button-page-url';
import { buildFieldPageURL } from '../test-utils/build-field-page-url';
import { buildKeyEventBytes } from '../test-utils/build-key-event-bytes';
import { buildPopupPageURL } from '../test-utils/build-popup-page-url';
import { buildSocketDumpArgv } from '../test-utils/build-socket-dump-argv';
import { buildSocketProbeArgv } from '../test-utils/build-socket-probe-argv';
import { buildWorkerSocketPageURL } from '../test-utils/build-worker-socket-page-url';
import { parseSocketDump } from '../test-utils/parse-socket-dump';

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

  const openURL = (url: string) =>
    send({
      op: 'open',
      url,
      limits: {
        bodyBytes: 1_000_000,
        timeoutMs: 30_000,
        redirects: 5,
        textBytes: 20_000,
        imageBytes: 0,
      },
      deniedRanges: [],
    });

  const openPage = (title: string) => openURL(buildButtonPageURL(title));

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

  // Runs a command as root in the computer sandbox, and returns its output.
  const execAsRoot = async (argv: readonly string[]) => {
    await callComputer({ op: 'desktopShot' });

    const [sandbox] = await adapter.list('computer-desktop');

    invariant(sandbox !== undefined, 'the computer sandbox exists');

    const result = await sandbox.exec({ argv });

    return new TextDecoder().decode(result.stdout.bytes);
  };

  // A WebSocket server on a loopback port of the sandbox, run as root.
  const startSocketServer = async (port: number) => {
    await callComputer({ op: 'desktopShot' });

    const [sandbox] = await adapter.list('computer-desktop');

    invariant(sandbox !== undefined, 'the computer sandbox exists');

    const script = `Bun.serve({ hostname: '127.0.0.1', port: ${String(port)}, fetch: (request, server) => { server.upgrade(request); }, websocket: { message: () => {} } }); await new Promise(() => {});`;

    const stream = await sandbox.spawn({
      argv: ['/usr/local/bin/bun', '-e', script],
      maxMessageBytes: 1024,
    });

    await waitFor(async () => {
      const lines = await execAsRoot(
        buildSocketProbeArgv([{ kind: 'tcp', host: '127.0.0.1', port }]),
      );

      expect(lines).toBe('open\n');
    });

    // imp ends a stopped process's stream before its exit arrives, and rejects both promises then.
    return { stop: () => Promise.allSettled([stream.stop(), stream.exit]) };
  };

  return {
    adapter,
    computer,
    execAsRoot,
    startSocketServer,
    runCommand,
    callComputer,
    createOldSandbox,
    send,
    openURL,
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

    // A browser window with no tracked tab refuses every act, so a page opens first. Chromium opens
    // over the whole display, so alt+tab brings the terminal, at 24, 24, to the front.
    await ctx.openPage('before');

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
  'it refuses a click with SCREEN_CHANGED when another X window is under the point',
  async () => {
    const ctx = await setupTest();

    // The page's button opens a second Chromium window over the middle of the display, so the X
    // window under the point changes while the tab and its URL stay as they were.
    await ctx.openURL(buildPopupPageURL('first'));

    const binding = await ctx.bind(640, 400);

    const opened = await ctx.send({
      op: 'screenAct',
      binding,
      act: { kind: 'click', x: 640, y: 400, button: 'left' },
    });

    const reply = await ctx.send({
      op: 'screenAct',
      binding,
      act: { kind: 'click', x: 640, y: 400, button: 'left' },
    });

    expect([opened.kind, reply]).toMatchObject([
      'screen',
      { kind: 'failed', reason: 'screen_changed' },
    ]);
  },
);

test.skipIf(!hasImpHost)(
  'it relays the real VNC server to a watch, which greets with a version',
  async () => {
    const ctx = await setupTest();

    const received: Uint8Array[] = [];
    const closed = { isClosed: false };

    const watch = ctx.computer.watch(
      {
        send: (bytes) => {
          received.push(bytes);
        },
        close: () => {
          closed.isClosed = true;
        },
      },
      'laptop',
    );

    onTestFinished(() => {
      watch.end();
    });

    await waitFor(() => {
      expect(received.length).toBeGreaterThan(0);
    });

    expect(new TextDecoder().decode(received[0]).startsWith('RFB 00')).toBe(true);
  },
);

test.skipIf(!hasImpHost)(
  'it moves the real pointer for the device that holds the desktop, and not before',
  async () => {
    const ctx = await setupTest();

    const received: Uint8Array[] = [];

    const watch = ctx.computer.watch(
      {
        send: (bytes) => {
          received.push(bytes);
        },
        close: () => {},
      },
      'laptop',
    );

    onTestFinished(() => {
      watch.end();
    });

    await waitFor(() => {
      expect(received.length).toBeGreaterThan(0);
    });

    watch.receive(new TextEncoder().encode('RFB 003.008\n'));
    watch.receive(new Uint8Array([1]));
    watch.receive(new Uint8Array([1]));

    // PointerEvent: type 5, no buttons, x 321, y 123
    const pointer = new Uint8Array([5, 0, 1, 65, 0, 123]);

    watch.receive(pointer);

    const before = await ctx.execAsRoot(['env', 'DISPLAY=:99', 'xdotool', 'getmouselocation']);

    await ctx.computer.takeover.start('laptop');

    watch.receive(pointer);

    await waitFor(async () => {
      const after = await ctx.execAsRoot(['env', 'DISPLAY=:99', 'xdotool', 'getmouselocation']);

      expect(after).toStartWith('x:321 y:123');
    });

    expect(before).not.toStartWith('x:321 y:123');
  },
);

test.skipIf(!hasImpHost)(
  'it types the keys of a paste into the focused field of a page, with a character outside Latin-1 and a line break',
  async () => {
    const ctx = await setupTest();

    await ctx.openURL(buildFieldPageURL('empty'));

    const received: Uint8Array[] = [];

    const watch = ctx.computer.watch(
      {
        send: (bytes) => {
          received.push(bytes);
        },
        close: () => {},
      },
      'laptop',
    );

    onTestFinished(() => {
      watch.end();
    });

    await waitFor(() => {
      expect(received.length).toBeGreaterThan(0);
    });

    watch.receive(new TextEncoder().encode('RFB 003.008\n'));
    watch.receive(new Uint8Array([1]));
    watch.receive(new Uint8Array([1]));

    await ctx.computer.takeover.start('laptop');

    // PointerEvent: type 5, the left button down then up, at x 640, y 400 on the field
    watch.receive(new Uint8Array([5, 1, 2, 128, 1, 144]));
    watch.receive(new Uint8Array([5, 0, 2, 128, 1, 144]));

    // keys sent before the window manager moves the focus would reach the terminal
    await waitFor(async () => {
      const focused = await ctx.execAsRoot([
        'env',
        'DISPLAY=:99',
        'xdotool',
        'getactivewindow',
        'getwindowname',
      ]);

      expect(focused).toStartWith('empty ');
    });

    // the keysyms that the web client sends for a paste of 'né☃\n'
    for (const keysym of [0x6e, 0xe9, 0x01_00_26_03, 0xff_0d]) {
      watch.receive(buildKeyEventBytes(keysym, true));
      watch.receive(buildKeyEventBytes(keysym, false));
    }

    await waitFor(async () => {
      const title = await ctx.execAsRoot([
        'env',
        'DISPLAY=:99',
        'xdotool',
        'getactivewindow',
        'getwindowname',
      ]);

      expect(title).toStartWith(`${encodeURIComponent('né☃\n')} `);
    });
  },
);

test.skipIf(!hasImpHost)(
  'it serves VNC on its Unix socket alone, which the guest reaches and the account that Chromium runs as does not',
  async () => {
    const ctx = await setupTest();

    const asRoot = await ctx.execAsRoot(
      buildSocketProbeArgv([{ kind: 'unix', path: '/run/nixie-vnc/vnc.sock' }]),
    );

    const dumped = await ctx.execAsRoot(buildSocketDumpArgv('x11vnc'));

    const dump = parseSocketDump(dumped);

    const asChrome = await ctx.execAsRoot([
      'setpriv',
      '--reuid=1001',
      '--regid=1001',
      '--clear-groups',
      ...buildSocketProbeArgv([
        { kind: 'tcp', host: '127.0.0.1', port: 5900 },
        { kind: 'tcp', host: '::1', port: 5900 },
        { kind: 'unix', path: '/run/nixie-vnc/vnc.sock' },
      ]),
    ]);

    expect([
      asRoot,
      asChrome,
      dump.processes.map((process) => ({ inet: process.inet, unixPaths: process.unixPaths })),
      dump.control.inet.map((socket) => `${socket.table} ${socket.state}`),
    ]).toStrictEqual([
      'open\n',
      'closed\nclosed\nclosed\n',
      [{ inet: [], unixPaths: expect.arrayContaining(['/run/nixie-vnc/vnc.sock']) }],
      ['tcp 0A', 'udp 07'],
    ]);
  },
);

test.skipIf(!hasImpHost)(
  'it gives a client on the X display no way to command the VNC server',
  async () => {
    const ctx = await setupTest();

    const answer = await ctx.execAsRoot([
      'setpriv',
      '--reuid=1001',
      '--regid=1001',
      '--clear-groups',
      'env',
      'DISPLAY=:99',
      'timeout',
      '15',
      'x11vnc',
      '-R',
      'ping',
    ]);

    expect(answer).not.toInclude('ans=');
  },
);

test.skipIf(!hasImpHost)(
  'it gives a command in the terminal no route to the display or the VNC server',
  async () => {
    const ctx = await setupTest();

    const result = await ctx.runCommand(
      buildSocketProbeArgv([
        { kind: 'tcp', host: '127.0.0.1', port: 5900 },
        { kind: 'tcp', host: '::1', port: 5900 },
        { kind: 'unix', path: '/run/nixie-vnc/vnc.sock' },
        { kind: 'abstract', name: '/tmp/.X11-unix/X99' },
      ])
        .map((word) => `'${word.replaceAll("'", String.raw`'\''`)}'`)
        .join(' '),
    );

    expect(result).toMatchObject({
      status: 'reply',
      reply: { kind: 'run', run: { stdout: { text: 'closed\nclosed\nclosed\nclosed\n' } } },
    });
  },
);

test.skipIf(!hasImpHost)(
  'it gives a Worker of a page in Chromium no WebSocket to the VNC port, or to a loopback port that a server listens on',
  async () => {
    const ctx = await setupTest();

    // The server on 5901 shows that the browser refuses the Worker's WebSocket, and that a closed
    // port alone does not.
    const server = await ctx.startSocketServer(5901);

    onTestFinished(() => server.stop());

    await ctx.openURL(
      buildWorkerSocketPageURL([
        'ws://127.0.0.1:5900/',
        'ws://[::1]:5900/',
        'ws://127.0.0.1:5901/',
      ]),
    );

    await waitFor(async () => {
      const title = await ctx.readTitle();

      expect(title).not.toBe('waiting');
    });

    const title = await ctx.readTitle();

    expect(title).toBe('failed,failed,failed');
  },
);
