import { z } from 'zod';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const checkedAction = signedIn.errors(reusedIDErrors);

export const computerContract = {
  // Mints a one-use ticket that opens one WebSocket of the computer's screen, view only. The URL
  // holds the ticket, so a client keeps it out of its own logs and never stores it.
  watch: checkedAction
    .errors({
      COMPUTER_UNAVAILABLE: { message: 'This nixie has no computer to watch', status: 503 },
    })
    .input(z.object({ clientActionID: z.uuid() }))
    .output(z.object({ streamURL: z.string().min(1).max(2048) })),
};
