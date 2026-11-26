import { z } from 'zod';

const countFields = {
  period: z.enum(['day', 'month']),

  // the ISO date of the period's first day, in the default zone
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  dollars: z.number().min(0),
};

// A correction of one period's count of a route or a provider, such as a reset to zero. It changes
// no limit. The route and the provider shapes are 2 strict objects, so the published schema and the
// runtime both refuse an input that names both or neither.
export const spendSetCountInputSchema = z.union([
  z.strictObject({ ...countFields, route: z.string().min(1) }),
  z.strictObject({ ...countFields, provider: z.string().min(1) }),
]);
