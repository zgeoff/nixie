import { z } from 'zod';

export const noRouteLimitSchema = z.looseObject({
  error: z.literal('no_route_limit'),
  route: z.string(),
});
