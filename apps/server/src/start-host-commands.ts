import { join } from 'node:path';
import type { APIContext } from '@heynixie/api';
import { makeHostResponder } from '@heynixie/api';
import type { StartedMemoryStore } from '@heynixie/memory';
import type { APIGate } from './build-api-gate';
import type { ConversationReset } from './run-conversation-reset';
import type { ServerReset } from './run-server-reset';
import { startControlSocket } from './start-control-socket';
import type { Cleanup } from './types';

export interface HostCommandsOptions {
  readonly dataDir: string;
  readonly apiContext: APIContext;

  readonly readMemory: () => StartedMemoryStore | null;

  readonly seedWrittenSkills: () => Promise<void>;
  readonly runReset: () => Promise<ServerReset>;
  readonly runConversationReset: () => Promise<ConversationReset>;

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
    runConversationReset: options.runConversationReset,
  });

  const control = await startControlSocket({
    path: join(options.dataDir, 'run', 'control.sock'),
    respond: (request) =>
      isResetCall(request) ? respond(request) : options.gate.run(request, respond),
  });

  await cleanup.defer(() => control.stop());
}

const resetPaths: ReadonlySet<string> = new Set(['/rpc/reset', '/rpc/resetConversations']);

function isResetCall(request: Request): boolean {
  // oRPC drops a trailing slash before it finds the procedure, so /rpc/reset/ is the reset too.
  return resetPaths.has(new URL(request.url).pathname.replace(/\/$/u, ''));
}
