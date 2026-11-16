import { z } from 'zod';
import { sequenceSchema } from './sequence-schema';
import { signedIn } from './signed-in';
import { threadSchema } from './thread-schema';

const jsonObjectSchema = z.record(z.string(), z.unknown());

const readableSchema = z.object({
  status: z.literal('readable'),
  toolCall: z
    .object({ input: jsonObjectSchema.optional(), content: jsonObjectSchema.optional() })
    .optional(),
  worker: z.object({ text: z.string().optional(), detail: z.string().optional() }).optional(),
});

const forgottenSchema = z.object({ status: z.literal('forgotten') });
const unreadableSchema = z.object({ status: z.literal('unreadable') });

const payloadSchema = z.discriminatedUnion('status', [
  readableSchema,
  forgottenSchema,
  unreadableSchema,
]);

const notFoundError = {
  message: 'No record on this thread has this sequence',
  status: 404,
} as const;

const inputSchema = z.object({ thread: threadSchema, sequence: sequenceSchema });

export const readPayloadContract = signedIn
  .errors({ RECORD_NOT_FOUND: notFoundError })
  .input(inputSchema)
  .output(payloadSchema);
