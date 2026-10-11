import { join } from 'node:path';
import type { APIContext } from '@heynixie/api';
import { createEnrolmentCode } from '@heynixie/api';
import { startControlSocket } from './start-control-socket';
import type { Cleanup } from './types';

// Opens the control socket the host commands reach the server through, in the data directory.
export async function startHostCommands(
  dataDir: string,
  apiContext: APIContext,
  cleanup: Cleanup,
): Promise<void> {
  const control = await startControlSocket({
    path: join(dataDir, 'run', 'control.sock'),
    createEnrolmentCode: () => createEnrolmentCode(apiContext),
  });

  await cleanup.defer(() => control.stop());
}
