import { join } from 'node:path';
import type { APIContext, HostBackups } from '@heynixie/api';
import { makeHostResponder } from '@heynixie/api';
import type { DefinitionsContext } from '@heynixie/definitions';
import type { StartedMemoryStore } from '@heynixie/memory';
import type { PromptsInForce } from '@heynixie/prompts';
import type { TurnInputs } from '@heynixie/turn-inputs';
import type { ConversationReset } from '../erasure/run-conversation-reset';
import type { Cleanup } from '../types';
import type { APIGate } from '../utils/build-api-gate';
import type { ServerReset } from '../utils/run-server-reset';
import { startControlSocket } from './start-control-socket';

export interface HostCommandsOptions {
  readonly dataDir: string;
  readonly apiContext: APIContext;

  readonly readMemory: () => StartedMemoryStore | null;
  readonly readBackups: () => HostBackups | null;

  readonly runInForceSeed: () => Promise<void>;
  readonly readDefinitions: () => DefinitionsContext | null;
  readonly readInForce: () => PromptsInForce | null;
  readonly wakeExports: () => void;
  readonly runReset: () => Promise<ServerReset>;
  readonly runConversationReset: () => Promise<ConversationReset>;

  readonly gate: Pick<APIGate, 'runCall'>;

  readonly turnInputs?: Pick<TurnInputs, 'list' | 'open' | 'set'>;
}

export async function startHostCommands(
  options: HostCommandsOptions,
  cleanup: Cleanup,
): Promise<void> {
  const respond = makeHostResponder({
    context: options.apiContext,
    readMemory: options.readMemory,
    readBackups: options.readBackups,
    runInForceSeed: options.runInForceSeed,
    readDefinitions: options.readDefinitions,
    readInForce: options.readInForce,
    wakeExports: options.wakeExports,
    runReset: options.runReset,
    runConversationReset: options.runConversationReset,
    gate: options.gate,
    ...(options.turnInputs === undefined ? {} : { turnInputs: options.turnInputs }),
  });

  const control = await startControlSocket({
    path: join(options.dataDir, 'run', 'control.sock'),
    respond,
  });

  await cleanup.defer(() => control.stop());
}
