import { mkdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { makeAddressCheck, resolveHostAddresses } from '@heynixie/egress';
import { runComputerGuest } from '@heynixie/wire';
import { makeShellHandler } from './shell/make-shell-handler';

const home = homedir();
const root = join(home, 'files');
const marker = join(home, '.nixie-disk-used');
const maxFrameBytes = 40 * 1024 * 1024;

await mkdir(root, { recursive: true });

const baseEnv = Object.fromEntries(
  Object.entries(process.env).flatMap(([name, value]) =>
    value === undefined ? [] : [[name, value]],
  ),
);

const deniedRanges = (baseEnv['NIXIE_DENIED_RANGES'] ?? '')
  .split(',')
  .filter((range) => range !== '');

await runComputerGuest(
  {
    input: Bun.stdin.stream(),
    write: async (bytes) => {
      await Bun.write(Bun.stdout, bytes);
    },
  },
  makeShellHandler({
    root,
    baseEnv: { ...baseEnv, HOME: home },
    checkAddress: makeAddressCheck(deniedRanges),
    resolveHost: resolveHostAddresses,
    takeIsDiskNew: async () => {
      const isUsed = await stat(marker).then(
        () => true,
        () => false,
      );

      if (!isUsed) {
        await writeFile(marker, '');
      }

      return !isUsed;
    },
  }),
  maxFrameBytes,
);
