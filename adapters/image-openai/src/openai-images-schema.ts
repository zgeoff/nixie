import { z } from 'zod';

// The parts of OpenAI's images API (https://platform.openai.com/docs/guides/image-generation)
// that nixie reads.

const imageSchema = z.object({ b64_json: z.string().optional() });
const stageSchema = z.enum(['input', 'output', 'unknown']);
const detailsSchema = z.object({ moderation_stage: stageSchema.optional() });

const errorBodySchema = z.object({
  code: z.string().nullable().optional(),
  message: z.string().optional(),
  moderation_details: detailsSchema.optional(),
});

export const openaiImagesSchema = {
  response: z.object({ data: z.array(imageSchema) }),
  error: z.object({ error: errorBodySchema }),
};
