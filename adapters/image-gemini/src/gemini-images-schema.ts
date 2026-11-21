import { z } from 'zod';

// The parts of the Gemini API's interactions call (https://ai.google.dev/gemini-api/docs/image-generation)
// that nixie reads.

const blockSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  data: z.string().optional(),
});

const stepSchema = z.object({ type: z.string(), content: z.array(blockSchema).optional() });
const errorBodySchema = z.object({ status: z.string().optional(), message: z.string().optional() });

export const geminiImagesSchema = {
  interaction: z.object({ steps: z.array(stepSchema).default([]) }),
  error: z.object({ error: errorBodySchema }),
};
