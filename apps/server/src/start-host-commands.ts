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

  readonly readMemory: () => StartedMemoryStore | null;

  readonly seedWrittenSkills: () => Promise<void>;
  readonly runReset: () => Promise<ServerReset>;

  readonly gate: Pick<APIGate, 'run'>;
}

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

function isResetCall(request: Request): boolean {
  // oRPC drops a trailing slash before it finds the procedure, so /rpc/reset/ is the reset too.
  return new URL(request.url).pathname.replace(/\/$/u, '') === '/rpc/reset';
}
