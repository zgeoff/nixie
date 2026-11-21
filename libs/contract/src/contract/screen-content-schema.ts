import { z } from 'zod';

export const screenMarkdownLimit = 20_000;
const screenFitSchema = z.enum(['whole', 'fill']);

// What a screen shows: markdown, or an image by its short ID. An image carries how it fits the
// screen, which 'whole' answers when the caller leaves it out.
export const screenContentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('markdown'), text: z.string().min(1).max(screenMarkdownLimit) }),
  z.object({
    kind: z.literal('image'),
    image: z.string().min(1).max(100),
    fit: screenFitSchema.default('whole'),
  }),
]);

export type ScreenContent = z.output<typeof screenContentSchema>;
