import { spendStopSchema } from '@heynixie/contract';
import { Collection } from '@msw/data';
import { z } from 'zod';

// The spending stop that stands, one at most: a test creates the stop it needs.
const stops = new Collection({ schema: z.object({ stop: spendStopSchema }) });

const raises = new Collection({
  schema: z.object({
    start: z.string(),
    route: z.string().optional(),
    dollars: z.number().optional(),
    turns: z.number().optional(),
  }),
});

export const spendStore = {
  raises,
  reset: (): void => {
    stops.clear();
    raises.clear();
  },
  stops,
};
