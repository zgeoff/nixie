import { imageLimits } from '@heynixie/contract';
import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const ownerImageMediaTypes = imageLimits.mediaTypes;

export type OwnerImageMediaType = (typeof ownerImageMediaTypes)[number];

const imageSchema = z.object({ mediaType: z.enum(ownerImageMediaTypes) });

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
