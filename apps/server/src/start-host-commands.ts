import { join } from 'node:path';
import type { APIContext } from '@heynixie/api';
import { makeHostResponder } from '@heynixie/api';
import type { StartedMemoryStore } from '@heynixie/memory';
import type { ServerReset } from './run-server-reset';
import { startControlSocket } from './start-control-socket';
import type { Cleanup } from './types';

export interface HostCommandsOptions {
  readonly dataDir: string;
  readonly apiContext: APIContext;

  // the memory store, or null before it starts
  readonly readMemory: () => StartedMemoryStore | null;
  readonly runReset: () => Promise<ServerReset>;
}

// Opens the control socket the host commands reach the server through, in the data directory. The
// memory commands answer once the memory store starts.
export async function startHostCommands(
  options: HostCommandsOptions,
  cleanup: Cleanup,
): Promise<void> {
  const control = await startControlSocket({
    path: join(options.dataDir, 'run', 'control.sock'),
    respond: makeHostResponder({
      context: options.apiContext,
      readMemory: options.readMemory,
      runReset: options.runReset,
    }),
  });

  await cleanup.defer(() => control.stop());
}
