import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { runComputerGuest } from '@heynixie/wire';
import { makeBrowserHandler } from './browser/make-browser-handler';

// The browser of the test build: a .test host resolves to loopback and loopback is allowed.
// The process sandbox points HOME at the sandbox's own folder, which holds no browser download, so
// the browsers are looked up under the account's real home.
process.env['PLAYWRIGHT_BROWSERS_PATH'] ??= join(userInfo().homedir, '.cache', 'ms-playwright');

await runComputerGuest(
  {
    input: Bun.stdin.stream(),
    write: async (bytes) => {
      await Bun.write(Bun.stdout, bytes);
    },
  },
  makeBrowserHandler({
    home: homedir(),
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    checkAddress: () => true,
    deniedRanges: [],
  }),
  1024 * 1024,
);
