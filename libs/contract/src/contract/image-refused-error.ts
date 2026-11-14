import { z } from 'zod';

const imageRefusedDataSchema = z.object({
  position: z.int().nonnegative().nullable(),
  reason: z.enum(['too_many', 'too_large', 'unsupported_type']),
});

export const imageRefusedError = {
  message: 'An image is too large, of a type nixie does not take, or one too many',
  status: 422,
  data: imageRefusedDataSchema,
};
