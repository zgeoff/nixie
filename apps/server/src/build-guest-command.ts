import { join } from 'node:path';
import type { GuestCommand, SandboxAdapter } from '@heynixie/sandbox';
import { isTestSandbox } from './is-test-sandbox';
import type { GuestEntry } from './types';

// The conversation image runs its guest from /app as the user nixie, for the conversation and each
// system task on that image: the session guest, or the check guest for the checker. The test
// sandbox runs the guest's source from the workspace with nixie's own Bun.
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
