import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { Sandbox } from '../types';

export interface RemovedSandboxes {
  readonly removed: readonly string[];
  readonly failed: readonly string[];
}

export async function removeSandboxes(
  sandboxes: readonly Pick<Sandbox, 'id' | 'destroy'>[],
  log: Logger,
): Promise<RemovedSandboxes> {
  const outcomes = await Promise.all(
    sandboxes.map(async (sandbox) => {
      try {
        await sandbox.destroy();

        return { sandboxID: sandbox.id, isRemoved: true };
      } catch (error) {
        log('sandbox.remove_failed', { sandboxID: sandbox.id, ...toErrorFields(error) }, 'error');

        return { sandboxID: sandbox.id, isRemoved: false };
      }
    }),
  );

  return {
    removed: outcomes.filter((outcome) => outcome.isRemoved).map((outcome) => outcome.sandboxID),
    failed: outcomes.filter((outcome) => !outcome.isRemoved).map((outcome) => outcome.sandboxID),
  };
}
