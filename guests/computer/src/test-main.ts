import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { startSocketProxy } from '@heynixie/egress';
import { runComputerGuest } from '@heynixie/wire';
import { makeComputerHandler } from './make-computer-handler';
import { makeScanChannel } from './make-scan-channel';
import { bridgePort, buildProxyEnv, makeShellHandler } from './shell/make-shell-handler';
import { ownAccount } from './shell/terminal-account';

// The computer of the test build runs as a plain process of the host, with no display and no
// accounts of its own, so Chromium is headless and a command runs as the host's user. Every host
// resolves to the loopback address, so a journey serves its own site and never reaches the internet.
const passwd = readFileSync('/etc/passwd', 'utf8').split('\n');
const entry = passwd.find((line) => line.split(':')[2] === String(process.getuid?.()));
const realHome = entry?.split(':')[5] ?? homedir();

// The process sandbox points HOME at the sandbox's own folder, which holds no browser download, so
// the browsers are looked up under the account's real home.
process.env['PLAYWRIGHT_BROWSERS_PATH'] ??= join(realHome, '.cache', 'ms-playwright');

// Playwright reads the variable when it loads, so the handler loads after it is set.
const browserModule = await import('./browser/make-browser-handler');
const diskModule = await import('./make-disk-marker');

const home = homedir();
const root = join(home, 'files');
const channel = makeScanChannel();

const proxyFolder = await mkdtemp(join(tmpdir(), 'nixie-proxy-'));

const proxySocketPath = join(proxyFolder, 'proxy.sock');

await mkdir(root, { recursive: true });

await startSocketProxy(
  {
    checkAddress: () => true,
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    scanURL: channel.scan,
    scanText: channel.scanText,
    canTunnel: false,
  },
  proxySocketPath,
);

const hostEnv = Object.entries(Bun.env).flatMap(([name, value]) =>
  value === undefined ? [] : [[name, value] as const],
);

const bridgeURL = `http://127.0.0.1:${String(bridgePort)}`;
const commandEnv = { ...buildProxyEnv(Object.fromEntries(hostEnv), bridgeURL), HOME: home };

const browser = browserModule.makeBrowserHandler({
  home,
  gate: channel,
  resolveHost: () => Promise.resolve(['127.0.0.1']),
  checkAddress: () => true,
  timeZone: process.env['NIXIE_TIME_ZONE'] ?? 'UTC',
  deniedRanges: [],
  isHeadless: true,
});

const shell = makeShellHandler({
  root,
  baseEnv: commandEnv,
  account: ownAccount,
  proxySocketPath,
  bridgeScript: join(import.meta.dir, 'shell/bridge-main.ts'),
  takeIsDiskNew: diskModule.makeDiskMarker(home),
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
