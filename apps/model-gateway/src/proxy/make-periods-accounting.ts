import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import { buildCallCost } from '@heynixie/models';
import { readOverride } from '../override/read-override';
import { collectTrips } from '../periods/collect-trips';
import { pickPeriodsRefusal } from '../periods/pick-periods-refusal';
import type { Override, PeriodStoreHandle } from '../types';
import { buildCallTokens } from '../usage/build-call-tokens';
import type { Accounting } from './accounting';
import { renderAPIError } from './render-api-error';

export interface PeriodsAccountingDeps {
  readonly store: PeriodStoreHandle;

  // null when the config names no override file
  readonly overridePath: string | null;
  readonly countBySandbox: boolean;
  readonly log: Logger;
}

// the count of a config with periods: a day, a month and each sandbox, read before each admission
export function makePeriodsAccounting(deps: PeriodsAccountingDeps): Accounting {
  // as with limits, the latch refuses in this process when the lost mark cannot be written
  let countFailed = false;
  let tripLogged = '';
  let overrideFailureLogged = false;

  const loseCount = async (): Promise<void> => {
    countFailed = true;

    await deps.store.markLost().catch((error: unknown) => {
      deps.log('counter.mark_failed', toErrorFields(error), 'error');
    });
  };

  const readCurrentOverride = async (): Promise<Override | null> => {
    if (deps.overridePath === null) {
      return null;
    }

    const read = await readOverride(deps.overridePath);

    if (read.kind === 'unreadable' && !overrideFailureLogged) {
      overrideFailureLogged = true;

      deps.log('override.unreadable', { reason: read.reason }, 'error');
    }

    return read.kind === 'found' ? read.override : null;
  };

  const admit = async (sandbox: string | null): Promise<Response | null> => {
    const store = await deps.store.read().catch((error: unknown) => {
      deps.log('counter.read_failed', toErrorFields(error), 'error');

      return null;
    });

    if (store === null) {
      return renderAPIError(
        503,
        'api_error',
        'the model gateway cannot read its counter store, so it refuses every request',
      );
    }

    const override = await readCurrentOverride();

    const held = countFailed ? { ...store, lost: true } : store;
    const refusal = pickPeriodsRefusal(held, override, sandbox, deps.countBySandbox);

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
      const store = await deps.store.addSpend(sandbox, {
        dollars: buildCallCost(usage, route.prices),
        tokens: buildCallTokens(usage),
      });

      const override = await readCurrentOverride();

      const trips = collectTrips(store, override);
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
