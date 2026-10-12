import { memoryWriterTaskID } from '@heynixie/memory';
import { registerSandboxImages } from './register-sandbox-images';
import { runDefinitionsSeed } from './run-definitions-seed';
import { runRecoverySteps } from './run-recovery-steps';
import { runWithRetry } from './run-with-retry';
import type { ConversationImp } from './start-conversation-imp';
import { startConversationImp } from './start-conversation-imp';
import { startMemory } from './start-memory';
import { startWork } from './start-work';
import { startWriterTask } from './start-writer-task';
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

// Starts the memory store and hands it to the conversation, then the memory writer and the runners,
// so no turn runs before the store is there.
async function startMemoryAndWork(
  parts: ServerParts,
  conversation: ConversationImp,
): Promise<void> {
  const retry = { signal: parts.cleanup.signal, log: parts.log };
  const store = await runWithRetry(() => startMemory(parts, conversation.cleanupSessions), {
    ...retry,
    step: 'memory',
  });

  parts.tools.memory.set(store);

  // the content gate checks one write of yours at a time, not a writer batch, so the writer stays
  // off and its catch-up waits for a gate that checks a batch
  const writerStep = await runWithRetry(() => startWriterTask(parts, store, null), {
    ...retry,
    step: 'memory_writer',
  });

  await startWork(parts, (input) =>
    writerStep !== null && input.taskID === memoryWriterTaskID
      ? writerStep(input)
      : conversation.runStep(input),
  );
}

async function requireSeeded(parts: ServerParts): Promise<void> {
  const seeded = await runDefinitionsSeed(parts);

  if (seeded.status === 'refused') {
    throw seeded.error;
  }
}
