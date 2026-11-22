import { expect, onTestFinished, test } from 'bun:test';
import { startComputer } from '@heynixie/connectors';
import { buildSandboxSpec } from '@heynixie/sandbox';
import { buildImpPort, buildImpSandboxAdapter, parseImpConfig } from '@heynixie/sandbox-imp';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import type { ComputerRequest } from '@heynixie/wire';

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

  return { adapter, computer, runCommand, callComputer, createOldSandbox };
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
