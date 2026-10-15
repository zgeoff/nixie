import { z } from 'zod';

// conversation.send's refusal of an image. too_many: more images than a message takes; too_large:
// one passes the byte limit; unsupported_type: one's bytes are none of the types nixie takes.
// position names the first image refused, or is null for too_many.
const imageRefusedDataSchema = z.object({
  position: z.int().nonnegative().nullable(),
  reason: z.enum(['too_many', 'too_large', 'unsupported_type']),
});

export const imageRefusedError = {
  message: 'An image is too large, of a type nixie does not take, or one too many',
  status: 422,
  data: imageRefusedDataSchema,
};
