import { spendCountsSchema, spendStopSchema } from '@heynixie/contract';
import { Collection } from '@msw/data';
import { z } from 'zod';

// The spending stop that stands, one at most: a test creates the stop it needs.
const stops = new Collection({ schema: z.object({ stop: spendStopSchema }) });

// The counts that the gateway gives, one set at most.
const counts = new Collection({ schema: z.object({ counts: spendCountsSchema }) });

const raises = new Collection({
  schema: z.object({
    start: z.string(),
    route: z.string().optional(),
    provider: z.string().optional(),
    dollars: z.number().optional(),
    turns: z.number().optional(),
  }),
});

const countSets = new Collection({
  schema: z.object({
    route: z.string().optional(),
    provider: z.string().optional(),
    period: z.enum(['day', 'month']),
    start: z.string(),
    dollars: z.number(),
  }),
});

export const spendStore = {
  countSets,
  raises,
  reset: (): void => {
    stops.clear();
    raises.clear();
    countSets.clear();
    counts.clear();
  },
  counts,
  stops,
};
