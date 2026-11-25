import { z } from 'zod';

export const regionMarkdownLimit = 20_000;
export const regionHTMLLimit = 200_000;
export const regionImagesLimit = 20;
export const clockFormats = ['HH:mm', 'HH:mm:ss', 'EEE d MMM'] as const;

// A region's kinds of content that the device page draws from the event alone. A live value runs in
// the device page, which keeps it fresh with no event from the server.
const plainContentSchemas = [
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
] as const;

const imageIDSchema = z.string().min(1).max(100);
const declaredImagesSchema = z.array(imageIDSchema).max(regionImagesLimit);
const ticketedImageSchema = z.object({ image: z.string(), ticket: z.string() });
const ticketedImagesSchema = z.array(ticketedImageSchema).max(regionImagesLimit);

// What one region of a layout shows. A page holds its HTML, and the images it may show by their
// image store IDs.
export const regionContentSchema = z.union([
  ...plainContentSchemas,
  z.object({
    kind: z.literal('html'),
    html: z.string().min(1).max(regionHTMLLimit),
    images: declaredImagesSchema.optional(),
  }),
]);

// What the device stream carries for a region. A page travels as the tickets of its frame and its
// images, and never as its HTML, which the frame's own request serves.
export const regionEventContentSchema = z.union([
  ...plainContentSchemas,
  z.object({
    kind: z.literal('html'),
    frame: z.string().min(1).max(100),
    images: ticketedImagesSchema,
  }),
]);

export type RegionContent = z.output<typeof regionContentSchema>;

export type RegionEventContent = z.output<typeof regionEventContentSchema>;
