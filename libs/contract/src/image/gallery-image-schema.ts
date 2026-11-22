import { z } from 'zod';

export const galleryImageSchema = z.object({
  // the short ID that the assistant also sees
  image: z.string(),

  // the latest image.named name; null when cleared, never set, or the image is forgotten
  name: z.string().nullable(),

  // from the result record; null for an import and for a forgotten image
  prompt: z.string().nullable(),

  // the image an edit started from; null for a new draw and an import
  from: z.string().nullable(),
  source: z.enum(['draw', 'file', 'photo']),
  isPinned: z.boolean(),

  // true when a forget made the result record unreadable; always false in images.list
  isForgotten: z.boolean(),

  // created_at of the images row
  createdAt: z.date(),
});
