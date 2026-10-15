import { join } from 'node:path';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { GuestCommand } from '@heynixie/sessions';
import { isTestSandbox } from './is-test-sandbox';

// The conversation image runs its guest from /app as the user nixie, for the conversation and each
// system task on that image. The test sandbox runs the guest's source from the workspace with
// nixie's own Bun, under the sandbox's own directory as its home.
export function buildGuestCommand(adapter: Pick<SandboxAdapter, 'id'>): GuestCommand {
  if (isTestSandbox(adapter)) {
    return {
      argv: [process.execPath, join(import.meta.dir, '../../../guests/conversation/src/main.ts')],
      env: {},
    };
  }

  return { argv: ['bun', '/app/guests/conversation/src/main.ts'], env: { HOME: '/home/nixie' } };
}
