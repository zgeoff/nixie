import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { RouteLimitsByID } from '../periods/collect-trips';
import { collectTrips } from '../periods/collect-trips';
import { pickPeriodsRefusal } from '../periods/pick-periods-refusal';
import type { PeriodStoreHandle } from '../types';
import type { Accounting } from './accounting';
import { makeLostLatch } from './make-lost-latch';
import { pickReplyCharge } from './pick-reply-charge';
import { renderAPIError } from './render-api-error';
import { writeReplyChargeLog } from './write-reply-charge-log';

export interface PeriodsAccountingDeps {
  readonly store: PeriodStoreHandle;
  readonly limits: RouteLimitsByID;
  readonly countBySandbox: boolean;
  readonly now: () => number;
  readonly log: Logger;
}

// the count of a config with periods: each route's day and month, and each sandbox, read before each
// admission
export function makePeriodsAccounting(deps: PeriodsAccountingDeps): Accounting {
  let tripLogged = '';
  const latch = makeLostLatch(deps.store.markLost, deps.log);

  const admit = async (route: string, sandbox: string | null): Promise<Response | null> => {
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

    const store = latch.isHeld() ? { ...held.store, lost: true } : held.store;

    const refusal = pickPeriodsRefusal({
      store,
      limits: deps.limits,
      overrides: held.overrides,
      route,
      sandbox,
      countBySandbox: deps.countBySandbox,
    });

    if (refusal === null) {
      return null;
    }

    if (refusal.kind !== 'limit_reached') {
      return renderAPIError(refusal.status, refusal.type, refusal.message);
    }

    // the refusal is the reason a step that began before it stopped, so the sandbox's count keeps it
    if (sandbox !== null) {
      await deps.store
        .writeRefusal(sandbox, { counter: refusal.counter, route, atMs: deps.now() })
        .catch((error: unknown) => {
          deps.log('counter.write_failed', toErrorFields(error), 'error');
        });
    }

    return renderAPIError(refusal.status, refusal.type, refusal.message, {
      counter: refusal.counter,
      route: refusal.route,
    });
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
      const counted = await deps.store.addSpend(reply.routeID, reply.sandbox, charge.spend);

      const trips = collectTrips(counted.store, deps.limits, counted.overrides);
      const key = trips.map((trip) => `${trip.route}:${trip.period}`).join(',');

      if (key !== '' && key !== tripLogged) {
        deps.log('limit.reached', { trips: key }, 'warn');
      }

      tripLogged = key;
    } catch (error) {
      deps.log('counter.write_failed', toErrorFields(error), 'error');

      await latch.loseCount();
    }
  };

  return { admit, count };
}
