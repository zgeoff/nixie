import { homedir } from 'node:os';
import { resolveHostAddresses } from '@heynixie/egress';
import { runComputerGuest } from '@heynixie/wire';
import { makeBrowserHandler } from './browser/make-browser-handler';

const maxFrameBytes = 1024 * 1024;
const timeZone = process.env['NIXIE_TIME_ZONE'] ?? 'UTC';
const listed = process.env['NIXIE_DENIED_RANGES'] ?? '';

await runComputerGuest(
  {
    input: Bun.stdin.stream(),
    write: async (bytes) => {
      await Bun.write(Bun.stdout, bytes);
    },
  },
  makeBrowserHandler({
    home: homedir(),
    resolveHost: resolveHostAddresses,
    timeZone,
    deniedRanges: listed.split(',').filter((range) => range !== ''),
  }),
  maxFrameBytes,
);
