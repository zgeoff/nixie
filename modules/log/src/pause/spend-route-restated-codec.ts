import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';

// A route that stands stopped now stands stopped at another limit or period, such as when a raise
// leaves it over its day limit, or when the day ends and the month still binds. It replaces the
// stop's row and sends no notice: the trip already told the owner, and the holds of the route stay.
export const spendRouteRestatedCodec = defineRecordCodec(
  'spend.route_restated',
  z.object({
    route: z.string(),
    period: z.enum(['day', 'month']),
    limit: z.number(),
    spent: z.number(),
    at: z.number(),
    resetsAt: z.number(),
  }),
);
