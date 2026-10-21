import { makeRetriedStart } from './make-retried-start';
import { registerSandboxImages } from './register-sandbox-images';
import { runDefinitionsSeed } from './run-definitions-seed';
import { runRecoverySteps } from './run-recovery-steps';
import type { ServerPartValues } from './server-part-values';
import { startConversationImp } from './start-conversation-imp';
import type { AnyPartDeclaration, ServerParts } from './types';

export const recoveryPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  {
    name: 'first_seed',
    needs: ['server_parts'],
    start: makeRetriedStart('first_seed', requireFirstSeed),
  },
  {
    name: 'recovery',
    needs: ['server_parts', 'first_seed'],
    start: makeRetriedStart('recovery', runRecoverySteps),
  },
  {
    name: 'add_images',
    needs: ['server_parts', 'recovery'],
    start: makeRetriedStart('add_images', registerSandboxImages),
  },
  {
    name: 'conversation_imp',
    needs: ['server_parts', 'add_images'],
    uses: ['memory'],
    start: makeRetriedStart('conversation_imp', (parts, reader) =>
      startConversationImp(parts, () => reader.get('memory')),
    ),
  },
];

async function requireFirstSeed(parts: ServerParts): Promise<void> {
  if (parts.inForce.read() !== null) {
    return;
  }

  const seeded = await runDefinitionsSeed(parts);

  if (seeded.status === 'refused') {
    throw seeded.error;
  }
}
