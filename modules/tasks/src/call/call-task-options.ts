import { z } from 'zod';

// What a call's task record keeps for the call runner: the call's short ID and the last
// conversation sequence that the call's session opens with.
export const callTaskOptionsSchema = z.object({
  callID: z.string(),
  seedThrough: z.int().nonnegative(),
});

export type CallTaskOptions = z.infer<typeof callTaskOptionsSchema>;

export const callRunnerKey = 'call';
