import { z } from 'zod';

// The arguments of a queued gmail.wake_set, after its input was resolved on the host: the
// connection, the named target, and the task that called the tool.
export const wakeSetArgumentsSchema = z.strictObject({
  connection: z.string(),
  from: z.array(z.string()).exactOptional(),
  subject: z.string().exactOptional(),
  thread: z.string().exactOptional(),
  wake: z.string(),
  setBy: z.string(),
  expires: z.string().exactOptional(),
  window: z.string().exactOptional(),
});
