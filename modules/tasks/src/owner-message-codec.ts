import { imageLimits } from '@heynixie/contract';
import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// an image's type, which a reader needs without the record's key
const imageSchema = z.object({ mediaType: z.enum(imageLimits.mediaTypes) });

// Your message's plain fields: its client ID, sender, span labels, time zone, when the device says
// you wrote it, and each image's type in the order sent, whose bytes the record seals. A message
// from before nixie recorded a field lacks it, and one with no images names none.
export const ownerMessageCodec = defineRecordCodec(
  'owner_message',
  z.object({
    clientMessageId: z.string().exactOptional(),
    identityID: z.string(),
    spans: z.enum(['as_sent', 'unknown']),
    timeZone: z.string().exactOptional(),
    writtenAt: z.string().exactOptional(),
    images: imageSchema.array().exactOptional(),
  }),
);
