import type { Logger } from '@heynixie/logger';
import type { SandboxLimit, SpendContext } from '../types';
import { withSandboxLimitLock } from './with-sandbox-limit-lock';
import { writeSandboxLimit } from './write-sandbox-limit';

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

// Goes again until the gateway takes the limit, because a limit below the task run's would refuse
// its next request. Each call checks and sends under the sandbox's lock, on the revision it read, so
// a step's limit lands after it, and a call that timed out and lands late changes nothing.
export async function patchLimitUntilSet(
  context: Pick<SpendContext, 'gateway' | 'clock'>,
  patch: SandboxLimitPatch,
  options: PatchLimitOptions,
): Promise<PatchLimitOutcome> {
  while (options.signal?.aborted !== true) {
    const answer = await withSandboxLimitLock(patch.sandbox, async () => {
      const current = await patch.readLimit();

      if (current === null) {
        return null;
      }

      return writeSandboxLimit(context.gateway, patch.sandbox, current.limit);
    });

    if (answer === null) {
      options.logger('spend.sandbox_limit_stale', { sandboxID: patch.sandbox }, 'info');

      return 'stale';
    }

    if (answer.kind === 'ok') {
      return 'set';
    }

    if (answer.kind === 'not_found') {
      return 'gone';
    }

    if (answer.kind === 'revision_changed') {
      continue;
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
