import { join } from 'node:path';
import type { HarnessEntry, HarnessGuest } from '@heynixie/models';
import type { GuestCommand, SandboxAdapter } from '@heynixie/sandbox';
import { isTestSandbox } from '@heynixie/sandbox';
import invariant from 'tiny-invariant';

export function buildGuestCommand(
  adapter: Pick<SandboxAdapter, 'id'>,
  guest: HarnessGuest,
  entry: HarnessEntry = 'turn',
): GuestCommand {
  const file = guest.entries[entry];

  invariant(file !== null, `the ${guest.package} guest has no ${entry} entry`);

  if (isTestSandbox(adapter)) {
    return {
      argv: [
        process.execPath,
        join(import.meta.dir, `../../../guests/${guest.package}/src/${file}.ts`),
      ],
      env: {},
    };
  }

  return {
    argv: ['bun', `/app/${guest.package}/${file}.js`],
    env: { HOME: '/home/nixie' },
  };
}
