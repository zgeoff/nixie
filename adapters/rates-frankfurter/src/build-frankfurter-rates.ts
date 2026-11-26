import type { RateSource } from '@heynixie/spend';
import { z } from 'zod';

export interface FrankfurterRatesOptions {
  // the API's base URL, such as https://api.frankfurter.dev/v1
  readonly apiURL: string;
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const latestSchema = z.object({ rates: z.record(z.string(), z.number().positive()) });
const requestTimeoutMs = 10_000;

// The rate of one US dollar in a currency, from the latest day that the source holds. A reply that
// is not the source's own, or that lacks the currency, gives no rate.
export function buildFrankfurterRates(options: FrankfurterRatesOptions): RateSource {
  return {
    readRate: async (currency) => {
      const url = `${options.apiURL.replace(/\/+$/u, '')}/latest?base=USD&symbols=${encodeURIComponent(currency)}`;

      const response = await options.fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });

      if (!response.ok) {
        return null;
      }

      const body: unknown = await response.json().catch(() => null);

      const parsed = latestSchema.safeParse(body);

      return parsed.success ? (parsed.data.rates[currency] ?? null) : null;
    },
  };
}
