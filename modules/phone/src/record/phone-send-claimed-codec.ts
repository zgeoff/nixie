import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const sendClaimedSchema = z.object({
  actionID: z.string(),

  // the provider's message ID that the send settled on, which one send alone may claim
  messageID: z.string(),
  shortID: z.string(),
});

// One send that settled on one provider message, written with the settlement. It holds IDs alone.
export const phoneSendClaimedCodec = defineRecordCodec('phone.send_claimed', sendClaimedSchema);
