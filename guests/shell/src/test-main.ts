import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runComputerGuest } from '@heynixie/wire';
import { makeShellHandler } from './shell/make-shell-handler';

// The shell of the test build. Every host resolves to the loopback address, and the guest allows
// it, so a journey can serve its own site and never reach the internet.
const home = homedir();
const root = join(home, 'files');

await mkdir(root, { recursive: true });

const used = { value: false };

await runComputerGuest(
  {
    input: Bun.stdin.stream(),
    write: async (bytes) => {
      await Bun.write(Bun.stdout, bytes);
    },
  },
  makeShellHandler({
    root,
    baseEnv: { ...Bun.env, HOME: home },
    bridgeScript: join(import.meta.dir, 'shell/bridge-main.ts'),
    checkAddress: () => true,
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    takeIsDiskNew: () => {
      const isNew = !used.value;

      used.value = true;

      return Promise.resolve(isNew);
    },
  }),
  40 * 1024 * 1024,
);
