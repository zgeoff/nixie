import { z } from 'zod';

export const regionMarkdownLimit = 20_000;
export const clockFormats = ['HH:mm', 'HH:mm:ss', 'EEE d MMM'] as const;

// What one region of a layout shows. A live value runs in the device page, which keeps it fresh
// with no event from the server.
export const regionContentSchema = z.union([
  z.object({
    kind: z.literal('markdown'),
    markdown: z.string().min(1).max(regionMarkdownLimit),
  }),
  z.object({
    kind: z.literal('image'),
    image: z.string().min(1).max(100),
    fit: z.enum(['whole', 'fill']).default('whole'),
  }),
  z.object({
    kind: z.literal('live'),
    live: z.literal('clock'),
    format: z.enum(clockFormats),
  }),
  z.object({
    kind: z.literal('live'),
    live: z.literal('countdown'),
    to: z.iso.datetime({ offset: true }),
    label: z.string().min(1).max(100).optional(),
  }),
]);

export type RegionContent = z.output<typeof regionContentSchema>;
