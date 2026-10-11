import { registerSandboxImages } from './register-sandbox-images';
import { runDefinitionsSeed } from './run-definitions-seed';
import { runRecoverySteps } from './run-recovery-steps';
import { runWithRetry } from './run-with-retry';
import { startConversationImp } from './start-conversation-imp';
import { startWork } from './start-work';
import type { ServerParts } from './types';

// The start steps behind the health endpoint, in order: recovery, the manifest's images, the
// conversation imp, the seed, then the runners. A failed step waits and runs again, so nixie stays
// live and unready until impd answers or the definitions seed.
export async function runStartSequence(parts: ServerParts): Promise<void> {
  const retry = { signal: parts.cleanup.signal, log: parts.log };

  // every record carries a snapshot hash, so a first start seeds before anything else writes
  if (parts.inForce.current === null) {
    await runWithRetry(() => requireSeeded(parts), { ...retry, step: 'first_seed' });
  }
  await runWithRetry(() => runRecoverySteps(parts), { ...retry, step: 'recovery' });
  await runWithRetry(() => registerSandboxImages(parts), { ...retry, step: 'add_images' });

  const runStep = await runWithRetry(() => startConversationImp(parts), {
    ...retry,
    step: 'conversation_imp',
  });

  await startWork(parts, runStep);
}

async function requireSeeded(parts: ServerParts): Promise<void> {
  const seeded = await runDefinitionsSeed(parts);

  if (seeded.status === 'refused') {
    throw seeded.error;
  }
}
