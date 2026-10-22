import type { CheckerTask } from '@heynixie/sessions';
import { startCheckerTask } from '@heynixie/sessions';
import type { ServerParts } from './types';

export async function startChecker(parts: ServerParts): Promise<CheckerTask> {
  const checker = await startCheckerTask({
    models: parts.config.models,
    secrets: parts.modelSecrets,
    sandboxes: parts.tools.adapter,
    image: parts.images.conversation.name,
    timeoutMs: parts.config.memory.checkerTimeoutMs,
    clock: parts.context.clock,
    log: parts.log,
  });

  await parts.cleanup.defer(() => checker.stop());

  return { check: checker.check };
}
