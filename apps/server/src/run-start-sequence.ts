import { registerSandboxImages } from './register-sandbox-images';
import { runDefinitionsSeed } from './run-definitions-seed';
import { runRecoverySteps } from './run-recovery-steps';
import { runWithRetry } from './run-with-retry';
import { startConversationImp } from './start-conversation-imp';
import { startMemoryAndWork } from './start-memory-and-work';
import type { ServerParts } from './types';

// The start steps behind the health endpoint: recovery, the images, the conversation imp, memory,
// the memory writer, the seed, then the runners, so a pending forget finds its session cleanup. A
// failed step runs again, so nixie stays live and unready until impd answers or the seed applies.
export async function runStartSequence(parts: ServerParts): Promise<void> {
  const retry = { signal: parts.cleanup.signal, log: parts.log };

  // every record carries a snapshot hash, so a first start seeds before anything else writes
  if (parts.inForce.read() === null) {
    await runWithRetry(() => requireSeeded(parts), { ...retry, step: 'first_seed' });
  }
  await runWithRetry(() => runRecoverySteps(parts), { ...retry, step: 'recovery' });
  await runWithRetry(() => registerSandboxImages(parts), { ...retry, step: 'add_images' });

  const conversation = await runWithRetry(
    () =>
      startConversationImp(parts, () => {
        // the runners that run turns start after the memory store
        const store = parts.tools.memory.read();

        if (store === null) {
          throw new Error('a turn ran before the memory store started');
        }
        return store;
      }),
    { ...retry, step: 'conversation_imp' },
  );

  await startMemoryAndWork(parts, conversation);
}

async function requireSeeded(parts: ServerParts): Promise<void> {
  const seeded = await runDefinitionsSeed(parts);

  if (seeded.status === 'refused') {
    throw seeded.error;
  }
}
