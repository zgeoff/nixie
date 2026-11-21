import { homedir } from 'node:os';
import { runComputerGuest } from '@heynixie/wire';
import { makeBrowserHandler } from './browser/make-browser-handler';

// The browser of the test build. A host under the reserved .test domain resolves to the loopback
// address, and the guest allows it, so a journey can serve its own site and never reach the
// internet.
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
