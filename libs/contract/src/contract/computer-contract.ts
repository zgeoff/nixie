import { z } from 'zod';
import { featureOffErrors } from './feature-off-errors';
import { reusedIDErrors } from './reused-id-errors';
import { sequenceSchema } from './sequence-schema';
import { signedIn } from './signed-in';

const computerProcedure = signedIn.errors(featureOffErrors);
const checkedAction = computerProcedure.errors(reusedIDErrors);

// null when the reason was forgotten
const openAskSchema = z.object({ sequence: sequenceSchema, reason: z.string().nullable() });

const unavailable = {
  COMPUTER_UNAVAILABLE: { message: 'This nixie has no computer to watch', status: 503 },
};

export const computerContract = {
  // Mints a one-use ticket that opens one WebSocket of the computer's screen. The socket carries the
  // keys and pointer of the device session only while that session holds the desktop. The URL holds
  // the ticket, so a client keeps it out of its own logs and never stores it.
  watch: checkedAction
    .errors(unavailable)
    .input(z.object({ clientActionID: z.uuid() }))
    .output(z.object({ streamURL: z.string().min(1).max(2048) })),

  // Takes over the desktop for the calling device session, which only a device session may do. From
  // the moment of the call the assistant's new calls wait, and the call waits for the calls already
  // running, up to their own limit.
  takeOver: checkedAction
    .errors({
      ...unavailable,
      BUSY_TOO_LONG: {
        message: 'The assistant is mid-action, and it did not finish in time. Try again',
        status: 409,
      },
      HELD_ELSEWHERE: { message: 'Another device holds the desktop', status: 409 },
    })
    .input(z.object({ clientActionID: z.uuid() }))
    .output(z.object({ takenOverAt: z.number().int().nonnegative() })),

  // The assistant's ask for a take-over, if one stands, with the log sequence the read saw. A client
  // follows the live stream from that sequence: an ask opens with a computer.handover_asked record
  // and ends with a computer.takeover_started or computer.handover_closed record.
  readHandover: computerProcedure.output(
    z.object({ ask: openAskSchema.nullable(), readAtSequence: sequenceSchema }),
  ),

  // Gives the desktop back, from the device session that holds it. Another device's call gets
  // NOT_TAKEN_OVER.
  handBack: checkedAction
    .errors({
      ...unavailable,
      NOT_TAKEN_OVER: { message: 'This device does not hold the desktop', status: 409 },
    })
    .input(z.object({ clientActionID: z.uuid() }))
    .output(z.object({ durationSeconds: z.number().int().nonnegative() })),
};
