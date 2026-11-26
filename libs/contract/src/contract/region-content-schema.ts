import { z } from 'zod';
import { packageSpecSchema } from './package-spec';

export const regionMarkdownLimit = 20_000;
export const regionHTMLLimit = 200_000;
export const regionImagesLimit = 20;
export const regionPackagesLimit = 20;
export const regionFetchesLimit = 8;
export const refreshMinutesRange = { min: 5, max: 1440 } as const;
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

const declaredFetchSchema = z.object({
  url: z
    .string()
    .min(1)
    .max(2000)
    .refine((url) => URL.canParse(url) && new URL(url).protocol === 'https:', 'an https URL'),
  refreshMinutes: z.int().min(refreshMinutesRange.min).max(refreshMinutesRange.max).optional(),
});

const declaredImagesSchema = z.array(imageIDSchema).max(regionImagesLimit);
const ticketedImageSchema = z.object({ image: z.string(), ticket: z.string() });
const ticketedImagesSchema = z.array(ticketedImageSchema).max(regionImagesLimit);

// A link element opens a connection from a resource hint that no policy stops, and a frame, object
// or embed holds a document with no guard of the page's own. A page has no network, and its styles
// go in a style element.
const blockedElementPattern = /<(?:link|iframe|frame|object|embed)(?![\w-])/iu;

// What one region of a layout shows. A page holds its HTML, and the images it may show by their
// image store IDs.
export const regionContentSchema = z.union([
  ...plainContentSchemas,
  z.object({
    kind: z.literal('html'),
    html: z
      .string()
      .min(1)
      .max(regionHTMLLimit)
      .refine((html) => !blockedElementPattern.test(html), {
        message:
          'a page cannot hold a link, frame, object or embed element: it has no network, and its styles go in a style element',
      }),
    images: declaredImagesSchema.optional(),
    packages: z.array(packageSpecSchema).max(regionPackagesLimit).optional(),
    fetches: z.array(declaredFetchSchema).max(regionFetchesLimit).optional(),
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
