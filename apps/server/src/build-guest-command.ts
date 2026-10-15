import { join } from 'node:path';
import type { GuestCommand } from '@heynixie/models';

// The conversation image runs its guest from /app as the user nixie, for the conversation and each
// system task on that image. A test build's process double runs the guest's source from the
// workspace with the test's own Bun, under the sandbox's own directory as its home.
export function buildGuestCommand(): GuestCommand {
  if (NIXIE_TEST_BUILD) {
    return {
      argv: [process.execPath, join(import.meta.dir, '../../../guests/conversation/src/main.ts')],
      env: {},
    };
  }

  return { argv: ['bun', '/app/guests/conversation/src/main.ts'], env: { HOME: '/home/nixie' } };
}
