import { z } from 'zod';
import { signedIn } from './signed-in';

// shortID is null for a kind that has none; the forget's own ID stays out, because the model never
// reads it
const stuckForgetSchema = z.object({
  kind: z.string(),
  shortID: z.string().nullable(),
  openForMs: z.int().nonnegative(),
});

const stuckForgetsSchema = z.object({ stuck: z.array(stuckForgetSchema) });

const erasureNotStarted = {
  ERASURE_NOT_STARTED: {
    message: 'nixie has not started its forgets yet; try again in a moment',
    status: 503,
  },
};

export const erasureContract = {
  readStuck: signedIn.errors(erasureNotStarted).output(stuckForgetsSchema),
  retryStuck: signedIn.errors(erasureNotStarted).output(stuckForgetsSchema),
};
