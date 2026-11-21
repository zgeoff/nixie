import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runComputerGuest } from '@heynixie/wire';

// The browser of the test build: a .test host resolves to loopback and loopback is allowed.
// The process sandbox points HOME at the sandbox's own folder, which holds no browser download, so
// the browsers are looked up under the account's real home.
const account = readFileSync('/etc/passwd', 'utf8')
  .split('\n')
  .find((line) => line.split(':')[2] === String(process.getuid?.()));

process.env['PLAYWRIGHT_BROWSERS_PATH'] ??= join(
  account?.split(':')[5] ?? homedir(),
  '.cache',
  'ms-playwright',
);

// Playwright reads the variable when it loads, so the handler loads after it is set.
const handlerModule = await import('./browser/make-browser-handler');

await runComputerGuest(
  {
    input: Bun.stdin.stream(),
    write: async (bytes) => {
      await Bun.write(Bun.stdout, bytes);
    },
  },
  handlerModule.makeBrowserHandler({
    home: homedir(),
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    checkAddress: () => true,
    deniedRanges: [],
  }),
  1024 * 1024,
);
