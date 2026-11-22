import { chmod, chown, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { makeAddressCheck, resolveHostAddresses, startSocketProxy } from '@heynixie/egress';
import { runComputerGuest } from '@heynixie/wire';
import { makeBrowserHandler } from './browser/make-browser-handler';
import { buildDesktopProcesses } from './desktop/build-desktop-processes';
import { buildDiskEntries } from './desktop/build-disk-entries';
import {
  chromeAccount,
  chromiumLauncherPath,
  display,
  screenAccount,
  terminalAccount,
  terminalCgroupName,
  terminalMemoryLimitBytes,
} from './desktop/constants';
import { createTerminalCgroup } from './desktop/create-terminal-cgroup';
import { prepareDisk } from './desktop/prepare-disk';
import { startDesktop } from './desktop/start-desktop';
import { makeComputerHandler } from './make-computer-handler';
import { makeDiskMarker } from './make-disk-marker';
import { makeScanChannel } from './make-scan-channel';
import { makeXDriver } from './screen/make-x-driver';
import { runScreenTool } from './screen/run-screen-tool';
import {
  bridgePort,
  buildProxyEnv,
  buildUnshareArgv,
  makeShellHandler,
} from './shell/make-shell-handler';
import { makeSeparateAccount } from './shell/terminal-account';

// The image's guest runs as root, to start the desktop's processes as their own accounts and to put
// the terminal's processes in their cgroup. It hands no root to any of them.
const home = process.env['HOME'] ?? '/home/computer';
const filesFolder = join(home, 'files');
const runFolder = '/run/nixie-computer';
const proxySocketPath = join(runFolder, 'proxy.sock');
const downloadsPath = '/tmp/nixie-downloads';
const screenFolder = '/tmp/nixie-screen';
const bridgeScript = join(dirname(Bun.main), 'bridge.js');

const deniedRanges = (process.env['NIXIE_DENIED_RANGES'] ?? '')
  .split(',')
  .filter((range) => range !== '');

const channel = makeScanChannel();

const cgroup = await createTerminalCgroup(
  '/sys/fs/cgroup',
  terminalCgroupName,
  terminalMemoryLimitBytes,
);

const account = makeSeparateAccount({
  uid: terminalAccount.uid,
  gid: terminalAccount.gid,
  cgroupProcsPath: cgroup.procsPath,
});

await prepareDisk(buildDiskEntries(home));
await mkdir(downloadsPath, { recursive: true });
await chown(downloadsPath, chromeAccount.uid, chromeAccount.gid);
await chmod(downloadsPath, 0o700);
await mkdir(screenFolder, { recursive: true });
await chown(screenFolder, screenAccount.uid, screenAccount.gid);
await chmod(screenFolder, 0o700);
await mkdir('/tmp/.X11-unix', { recursive: true });
await chmod('/tmp/.X11-unix', 0o1777);

// The terminal's one way out is a proxy on a Unix socket that only the terminal's group reaches. It
// refuses a tunnel, because it cannot read one, and scans through the guest's scan channel.
await mkdir(runFolder, { recursive: true });
await chown(runFolder, 0, terminalAccount.gid);
await chmod(runFolder, 0o710);

await startSocketProxy(
  {
    checkAddress: makeAddressCheck(deniedRanges),
    resolveHost: resolveHostAddresses,
    scanURL: channel.scan,
    scanText: channel.scanText,
    canTunnel: false,
  },
  proxySocketPath,
);

await chown(proxySocketPath, 0, terminalAccount.gid);
await chmod(proxySocketPath, 0o660);

const inheritedEntries = Object.entries(process.env).filter(
  ([name, value]) => value !== undefined && !name.startsWith('NIXIE_'),
);

const baseEnv = Object.fromEntries(inheritedEntries.map(([name, value]) => [name, value ?? '']));
const terminalBaseEnv = { ...baseEnv, HOME: home, USER: terminalAccount.name };
const bridgeURL = `http://127.0.0.1:${String(bridgePort)}`;

await startDesktop(
  buildDesktopProcesses({
    terminal: account,
    terminalShellArgv: buildUnshareArgv(
      { bridgeScript, proxySocketPath },
      ['bash', '-l'],
      'inherit',
    ),
    terminalEnv: { ...buildProxyEnv(terminalBaseEnv, bridgeURL), TERM: 'xterm-256color' },
    filesFolder,
  }),
  stopForDisplay,
);

process.on('SIGTERM', handleStop);
process.on('SIGINT', handleStop);

const browser = makeBrowserHandler({
  home,
  gate: channel,
  resolveHost: resolveHostAddresses,
  timeZone: process.env['NIXIE_TIME_ZONE'] ?? 'UTC',
  deniedRanges,
  isHeadless: false,
  display,
  executablePath: chromiumLauncherPath,
  downloadsPath,
  screen: {
    makeDriver: () =>
      makeXDriver({ runTool: runScreenTool, shotPath: join(screenFolder, 'shot.png') }),
    settleMs: 300,
  },
});

const shell = makeShellHandler({
  root: filesFolder,
  baseEnv: terminalBaseEnv,
  account,
  proxySocketPath,
  bridgeScript,
  takeIsDiskNew: makeDiskMarker(home),
});

await runComputerGuest(
  {
    input: Bun.stdin.stream(),
    write: async (bytes) => {
      await Bun.write(Bun.stdout, bytes);
    },
  },
  makeComputerHandler({ browser, shell }),
  40 * 1024 * 1024,
  { onReady: channel.bind },
);

await cgroup.kill();

function stopForDisplay(): void {
  process.stderr.write('the display exited\n');
  process.exit(1);
}

function handleStop(): void {
  void stopTerminal();
}

async function stopTerminal(): Promise<void> {
  await cgroup.kill();

  process.exit(0);
}
