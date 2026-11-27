import { eventIterator } from '@orpc/contract';
import { z } from 'zod';
import { deviceEventSchema, notADeviceError, pixelsSchema } from './devices-contract';
import { featureOffErrors } from './feature-off-errors';
import { liveTopicSchema } from './live-topic-schema';
import { recordSchema } from './record-schema';
import { sequenceSchema } from './sequence-schema';
import { signedIn } from './signed-in';
import { threadSchema } from './thread-schema';

// The page form: opened, then record and changed events. The objects are strict, so a device form
// never parses as a page form with its key stripped.
const pageFormSchema = z.strictObject({
  afterSequence: sequenceSchema.optional(),
  thread: threadSchema.optional(),
  clipPayloads: z.boolean().optional(),
});

// The device form: opened, then device events only.
const deviceFormSchema = z.strictObject({ device: z.object({ pixels: pixelsSchema }) });
const changedTopicsSchema = z.array(liveTopicSchema).min(1);

const liveEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('opened') }),
  z.object({ kind: z.literal('record'), record: recordSchema }),
  z.object({ kind: z.literal('changed'), topics: changedTopicsSchema }),
  z.object({ kind: z.literal('device'), event: deviceEventSchema }),
]);

const liveErrors = {
  ...featureOffErrors,
  FORBIDDEN: { message: 'A device session follows only its own screen', status: 403 },
  NOT_A_DEVICE: notADeviceError,
};

export const followLive = signedIn
  .errors(liveErrors)
  .input(z.union([pageFormSchema, deviceFormSchema]))
  .output(eventIterator(liveEventSchema));
