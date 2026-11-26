import { z } from 'zod';
import { controlRoutes } from './harness/control-routes';
import { readLiveOpens } from './read-live-opens';

const argsSchema = z.strictObject({ opened: z.int().nonnegative().optional() });

// The `live opens` command counts the live streams the browser opened since `up`; --opened checks
// the count.
export const liveOpensCommand = {
  path: ['live', 'opens'],
  summary: 'Count the live streams the browser opened since `up`; --opened checks the count',
  effect: 'read',
  args: argsSchema,
  data: controlRoutes.liveOpens.output,
  run: (args: z.output<typeof argsSchema>, ctx: Parameters<typeof readLiveOpens>[0]) =>
    readLiveOpens(ctx, args.opened),
} as const;
