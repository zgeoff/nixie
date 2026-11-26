import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { DisplayRates, RateSource } from '../types';

export interface DisplayRatesOptions {
  readonly currency: string;
  readonly source: RateSource;
  readonly clock: Clock;
  readonly log: Logger;
}

const dayMs = 24 * 60 * 60 * 1000;

// Reads one rate a day, and keeps the last one it read. A read that fails or gives no rate leaves
// the last rate standing and waits a day before the next try. The first read waits for the source,
// and each later one answers from memory while a stale rate refreshes behind it.
export function createDisplayRates(options: DisplayRatesOptions): DisplayRates {
  const state: { rate: number | null; triedAtMs: number | null; reading: Promise<void> | null } = {
    rate: null,
    triedAtMs: null,
    reading: null,
  };

  const refreshOnce = async (): Promise<void> => {
    try {
      await refresh();
    } finally {
      state.reading = null;
    }
  };

  const refresh = async (): Promise<void> => {
    state.triedAtMs = options.clock.now();

    try {
      const rate = await options.source.readRate(options.currency);

      if (rate !== null) {
        state.rate = rate;
      }
    } catch (error) {
      options.log(
        'spend.rate_read_failed',
        { currency: options.currency, ...toErrorFields(error) },
        'warn',
      );
    }
  };

  return {
    currency: options.currency,
    readRate: async () => {
      const isStale = state.triedAtMs === null || options.clock.now() - state.triedAtMs >= dayMs;

      if (isStale && state.reading === null) {
        state.reading = refreshOnce();
      }

      if (state.rate === null) {
        await state.reading;
      }

      return state.rate;
    },
  };
}
