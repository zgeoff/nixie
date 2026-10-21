import { join } from 'node:path';
import type { GuestCommand, SandboxAdapter } from '@heynixie/sandbox';
import { isTestSandbox } from '@heynixie/sandbox';
import type { GuestEntry } from './types';

export function buildGuestCommand(
  adapter: Pick<SandboxAdapter, 'id'>,
  entry: GuestEntry = 'main',
): GuestCommand {
  if (isTestSandbox(adapter)) {
    return {
      argv: [
        process.execPath,
        join(import.meta.dir, `../../../guests/conversation/src/${entry}.ts`),
      ],
      env: {},
    };
  }

  return {
    argv: ['bun', `/app/guests/conversation/src/${entry}.ts`],
    env: { HOME: '/home/nixie' },
  };
}
