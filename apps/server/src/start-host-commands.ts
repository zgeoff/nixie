import { join } from 'node:path';
import type { APIContext } from '@heynixie/api';
import { makeHostResponder } from '@heynixie/api';
import type { StartedMemoryStore } from '@heynixie/memory';
import type { PromptsInForce } from '@heynixie/prompts';
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
  readonly readInForce: () => PromptsInForce | null;
  readonly wakeExports: () => void;
  readonly runReset: () => Promise<ServerReset>;
  readonly runConversationReset: () => Promise<ConversationReset>;

  readonly gate: Pick<APIGate, 'runCall'>;
}

export async function startHostCommands(
  options: HostCommandsOptions,
  cleanup: Cleanup,
): Promise<void> {
  const respond = makeHostResponder({
    context: options.apiContext,
    readMemory: options.readMemory,
    seedWrittenSkills: options.seedWrittenSkills,
    readInForce: options.readInForce,
    wakeExports: options.wakeExports,
    runReset: options.runReset,
    runConversationReset: options.runConversationReset,
    gate: options.gate,
  });

  const control = await startControlSocket({
    path: join(options.dataDir, 'run', 'control.sock'),
    respond,
  });

  await cleanup.defer(() => control.stop());
}
