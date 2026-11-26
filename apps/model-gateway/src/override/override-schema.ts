import { z } from 'zod';
import type { Overrides } from '../types';

const dayOverrideSchema = z.strictObject({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  dollars: z.number().positive(),
});

// the day limit of each route and of each provider, by ID. A route and a provider may share an ID.
export const overrideSchema = z.strictObject({
  routes: z.record(z.string().min(1), dayOverrideSchema).default({}),
  providers: z.record(z.string().min(1), dayOverrideSchema).default({}),
}) satisfies z.ZodType<Overrides>;
