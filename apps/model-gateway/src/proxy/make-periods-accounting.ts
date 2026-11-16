import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import { buildCallCost } from '@heynixie/models/prices';
import { collectTrips } from '../periods/collect-trips';
import { pickPeriodsRefusal } from '../periods/pick-periods-refusal';
import type { PeriodStoreHandle } from '../types';
import { buildCallTokens } from '../usage/build-call-tokens';
import type { Accounting } from './accounting';
import { renderAPIError } from './render-api-error';

export interface PeriodsAccountingDeps {
  readonly store: PeriodStoreHandle;
  readonly countBySandbox: boolean;
  readonly log: Logger;
}

// the count of a config with periods: a day, a month and each sandbox, read before each admission
export function makePeriodsAccounting(deps: PeriodsAccountingDeps): Accounting {
  // as with limits, the latch refuses in this process when the lost mark cannot be written
  let countFailed = false;
  let tripLogged = '';

  const loseCount = async (): Promise<void> => {
    await deps.store.markLost().catch((error: unknown) => {
      // with no mark in the store, only this process can refuse, until a restart
      countFailed = true;

      deps.log('counter.mark_failed', toErrorFields(error), 'error');
    });
  };

  const admit = async (sandbox: string | null): Promise<Response | null> => {
    const held = await deps.store.readInForce().catch((error: unknown) => {
      deps.log('counter.read_failed', toErrorFields(error), 'error');

      return null;
    });

    if (held === null) {
      return renderAPIError(
        503,
        'api_error',
        'the model gateway cannot read its counter store, so it refuses every request',
      );
    }

    const store = countFailed ? { ...held.store, lost: true } : held.store;
    const refusal = pickPeriodsRefusal(store, held.override, sandbox, deps.countBySandbox);

    return refusal === null ? null : renderAPIError(refusal.status, refusal.type, refusal.message);
  };

  const count: Accounting['count'] = async (route, sandbox, usage, required) => {
    if (usage === null && required) {
      deps.log('count.lost', {}, 'error');

      await loseCount();

      return;
    }

    if (usage === null) {
      return;
    }

    try {
      const counted = await deps.store.addSpend(sandbox, {
        dollars: buildCallCost(usage, route.prices),
        tokens: buildCallTokens(usage),
      });

      const trips = collectTrips(counted.store, counted.override);
      const key = trips.map((trip) => `${trip.period}:${trip.measure}`).join(',');

      if (key !== '' && key !== tripLogged) {
        deps.log('limit.reached', { trips: key }, 'warn');
      }

      tripLogged = key;
    } catch (error) {
      deps.log('counter.write_failed', toErrorFields(error), 'error');

      await loseCount();
    }
  };

  return { admit, count, loseCount };
}
