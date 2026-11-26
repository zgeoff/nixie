import type { Logger } from '@heynixie/logger';
import type { SandboxLimit, SpendContext } from '../types';

export interface SandboxLimitPatch {
  readonly sandbox: string;
  readonly limit: SandboxLimit | null;
}

export interface PatchLimitOptions {
  // how long a call that the gateway did not answer waits before it goes again
  readonly retryMs: number;
  readonly logger: Logger;
  readonly signal?: AbortSignal;
}

// 'set': the gateway took the limit. 'gone': the gateway holds no such sandbox, so no limit is
// stale. 'stopped': the signal aborted before the gateway took it.
export type PatchLimitOutcome = 'set' | 'gone' | 'stopped';

// Sets a sandbox's limit and goes again until the gateway takes it, because a limit that stays lower
// than the task run's would refuse the task's next request.
export async function patchLimitUntilSet(
  context: Pick<SpendContext, 'gateway' | 'clock'>,
  patch: SandboxLimitPatch,
  options: PatchLimitOptions,
): Promise<PatchLimitOutcome> {
  while (options.signal?.aborted !== true) {
    const answer = await context.gateway.patchSandbox(patch.sandbox, patch.limit);

    if (answer.kind === 'ok') {
      return 'set';
    }

    if (answer.kind === 'not_found') {
      return 'gone';
    }

    options.logger(
      'spend.sandbox_limit_unset',
      { sandboxID: patch.sandbox, reason: answer.reason },
      'warn',
    );

    await context.clock.sleep(options.retryMs, options.signal).catch(() => {});
  }

  return 'stopped';
}
