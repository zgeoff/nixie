import { join } from 'node:path';
import type { APIContext } from '@heynixie/api';
import { createEnrolmentCode, readSessions, updateSessionLabel } from '@heynixie/api';
import type { ServerReset } from './run-server-reset';
import { startControlSocket } from './start-control-socket';
import type { Cleanup, MemorySlot } from './types';

export interface HostCommandsOptions {
  readonly dataDir: string;
  readonly apiContext: APIContext;
  readonly memory: MemorySlot;
  readonly runReset: () => Promise<ServerReset>;
}

// Opens the control socket the host commands reach the server through, in the data directory. The
// memory commands answer once the start sequence fills the memory slot.
export async function startHostCommands(
  options: HostCommandsOptions,
  cleanup: Cleanup,
): Promise<void> {
  const control = await startControlSocket({
    path: join(options.dataDir, 'run', 'control.sock'),
    createEnrolmentCode: () => createEnrolmentCode(options.apiContext),
    readMemory: () => options.memory.read(),
    readSessions: () => readSessions(options.apiContext, null),
    updateSessionLabel: (input) => updateSessionLabel(options.apiContext, input),
    runReset: options.runReset,
  });

  await cleanup.defer(() => control.stop());
}
