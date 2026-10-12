import { memoryWriterTaskID } from '@heynixie/memory';
import { registerSandboxImages } from './register-sandbox-images';
import { runDefinitionsSeed } from './run-definitions-seed';
import { runRecoverySteps } from './run-recovery-steps';
import { runWithRetry } from './run-with-retry';
import { startConversationImp } from './start-conversation-imp';
import { startMemory } from './start-memory';
import { startWork } from './start-work';
import { startWriterTask } from './start-writer-task';
import type { ServerParts } from './types';

// The start steps behind the health endpoint, in order: recovery, memory, the manifest's images,
// the conversation imp, the seed, then the runners. A failed step waits and runs again, so nixie stays
// live and unready until impd answers or the definitions seed.
export async function runStartSequence(parts: ServerParts): Promise<void> {
  const retry = { signal: parts.cleanup.signal, log: parts.log };

  // every record carries a snapshot hash, so a first start seeds before anything else writes
  if (parts.inForce.read() === null) {
    await runWithRetry(() => requireSeeded(parts), { ...retry, step: 'first_seed' });
  }
  await runWithRetry(() => runRecoverySteps(parts), { ...retry, step: 'recovery' });
  const store = await runWithRetry(() => startMemory(parts), { ...retry, step: 'memory' });
  await runWithRetry(() => registerSandboxImages(parts), { ...retry, step: 'add_images' });

  const conversationStep = await runWithRetry(() => startConversationImp(parts, store), {
    ...retry,
    step: 'conversation_imp',
  });

  // no content gate exists yet, so the writer stays off and its catch-up waits for one
  const writerStep = await runWithRetry(() => startWriterTask(parts, store, null), {
    ...retry,
    step: 'memory_writer',
  });

  await startWork(parts, (input) =>
    writerStep !== null && input.taskID === memoryWriterTaskID
      ? writerStep(input)
      : conversationStep(input),
  );
}

async function requireSeeded(parts: ServerParts): Promise<void> {
  const seeded = await runDefinitionsSeed(parts);

  if (seeded.status === 'refused') {
    throw seeded.error;
  }
}
