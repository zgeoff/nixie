import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { CounterStore, ProxyLimits, SpendTotals, StoredCount } from '../types';
import type { Accounting } from './accounting';
import { makeLostLatch } from './make-lost-latch';
import { pickReplyCharge } from './pick-reply-charge';
import { renderAPIError } from './render-api-error';
import { writeReplyChargeLog } from './write-reply-charge-log';

export interface LimitsAccountingDeps {
  readonly limits: ProxyLimits;
  readonly store: CounterStore;
  readonly log: Logger;
}

// the count of a config with limits: one total that never resets
export function makeLimitsAccounting(deps: LimitsAccountingDeps): Accounting {
  // a count that failed to write, or a reply with no usage and no bound, leaves the store behind the
  // spend, so the store keeps a mark that refuses every later request, across a restart, until an
  // operator clears it
  let limitLogged = false;
  const latch = makeLostLatch(deps.store.markLost, deps.log);

  const admit = async (): Promise<Response | null> => {
    const totals = await readTotals(deps);

    if (totals === null) {
      return renderAPIError(
        503,
        'api_error',
        'the model gateway cannot read its counter store, so it refuses every request',
      );
    }

    if (latch.isHeld() || totals.lost) {
      return renderAPIError(
        503,
        'api_error',
        'the model gateway lost the count of a reply, so it refuses every request until an operator clears the mark in its counter store',
      );
    }

    if (isLimitReached(totals, deps.limits)) {
      return renderAPIError(403, 'permission_error', formatLimitRefusal(totals, deps.limits));
    }

    return null;
  };

  const count: Accounting['count'] = async (reply) => {
    const charge = pickReplyCharge(reply);

    if (charge.kind === 'none') {
      return;
    }

    writeReplyChargeLog(deps.log, reply, charge);

    if (charge.kind === 'lost') {
      await latch.loseCount();

      return;
    }

    try {
      const totals = await deps.store.add(charge.spend);

      if (!limitLogged && isLimitReached(totals, deps.limits)) {
        limitLogged = true;

        deps.log('limit.reached', { ...totals }, 'warn');
      }
    } catch (error) {
      deps.log('counter.write_failed', toErrorFields(error), 'error');

      await latch.loseCount();
    }
  };

  return { admit, count };
}

async function readTotals(deps: LimitsAccountingDeps): Promise<StoredCount | null> {
  try {
    return await deps.store.read();
  } catch (error) {
    deps.log('counter.read_failed', toErrorFields(error), 'error');

    return null;
  }
}

function isLimitReached(totals: SpendTotals, limits: ProxyLimits): boolean {
  return (
    (limits.dollars !== null && totals.dollars >= limits.dollars) ||
    (limits.tokens !== null && totals.tokens >= limits.tokens)
  );
}

function formatLimitRefusal(totals: SpendTotals, limits: ProxyLimits): string {
  const spent = [
    limits.dollars === null ? null : `$${totals.dollars.toFixed(4)} of $${String(limits.dollars)}`,
    limits.tokens === null ? null : `${String(totals.tokens)} of ${String(limits.tokens)} tokens`,
  ].filter((part) => part !== null);

  return `the model gateway reached its spending limit (${spent.join(', ')}), so it refuses every further request`;
}
