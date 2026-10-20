import { join } from 'node:path';
import type { APIContext } from '@heynixie/api';
import { makeHostResponder } from '@heynixie/api';
import type { StartedMemoryStore } from '@heynixie/memory';
import type { APIGate } from './build-api-gate';
import type { ServerReset } from './run-server-reset';
import { startControlSocket } from './start-control-socket';
import type { Cleanup } from './types';

export interface HostCommandsOptions {
  readonly dataDir: string;
  readonly apiContext: APIContext;

  // the memory store, or null before it starts
  readonly readMemory: () => StartedMemoryStore | null;

  // puts the skills nixie wrote in force after an approval
  readonly seedWrittenSkills: () => Promise<void>;
  readonly runReset: () => Promise<ServerReset>;

  // the gate a reset closes before it removes anything
  readonly gate: Pick<APIGate, 'run'>;
}

// Opens the control socket the host commands reach the server through, in the data directory. The
// memory commands answer once the memory store starts. Every host call but the reset passes the
// API's gate, so a reset waits for one in flight and refuses a later one, as it does a device's.
export async function startHostCommands(
  options: HostCommandsOptions,
  cleanup: Cleanup,
): Promise<void> {
  const respond = makeHostResponder({
    context: options.apiContext,
    readMemory: options.readMemory,
    seedWrittenSkills: options.seedWrittenSkills,
    runReset: options.runReset,
  });

  const control = await startControlSocket({
    path: join(options.dataDir, 'run', 'control.sock'),
    respond: (request) =>
      isResetCall(request) ? respond(request) : options.gate.run(request, respond),
  });

  await cleanup.defer(() => control.stop());
}

// The reset itself never passes the gate: the reset closes the gate and waits for the calls in
// flight, so a reset counted among them would wait for itself. oRPC drops a trailing slash before it
// finds the procedure, so /rpc/reset/ is the reset too.
function isResetCall(request: Request): boolean {
  return new URL(request.url).pathname.replace(/\/$/u, '') === '/rpc/reset';
}
