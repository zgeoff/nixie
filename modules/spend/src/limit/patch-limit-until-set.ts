import type { Logger } from '@heynixie/logger';
import type { SandboxLimit, SpendContext } from '../types';

export interface SandboxLimitPatch {
  readonly sandbox: string;

  // the limit to set now, read again before each call, or null when a newer limit has replaced the
  // one this patch is for
  readonly readLimit: () => Promise<{ readonly limit: SandboxLimit | null } | null>;
}

export interface PatchLimitOptions {
  // how long a call that the gateway did not answer waits before it goes again
  readonly retryMs: number;
  readonly logger: Logger;
  readonly signal?: AbortSignal;
}

// 'set': the gateway took the limit. 'gone': the gateway holds no such sandbox, so no limit is
// stale. 'stale': a newer limit replaced this one. 'stopped': the signal aborted before the gateway
// took it.
export type PatchLimitOutcome = 'set' | 'gone' | 'stale' | 'stopped';

// Sets a sandbox's limit and goes again until the gateway takes it, because a limit that stays lower
// than the task run's would refuse the task's next request. Each call sets the limit as it stands
// then, so a retry never overwrites a limit that a step set meanwhile.
export async function patchLimitUntilSet(
  context: Pick<SpendContext, 'gateway' | 'clock'>,
  patch: SandboxLimitPatch,
  options: PatchLimitOptions,
): Promise<PatchLimitOutcome> {
  while (options.signal?.aborted !== true) {
    const current = await patch.readLimit();

    if (current === null) {
      options.logger('spend.sandbox_limit_stale', { sandboxID: patch.sandbox }, 'info');

      return 'stale';
    }

    const answer = await context.gateway.patchSandbox(patch.sandbox, current.limit);

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
