import { z } from 'zod';

// the most bytes of one frame in either direction: the layout's files go in, and a picture of a
// large screen comes out
export const renderFrameLimitBytes = 64 * 1024 * 1024;
export const renderEntryPath = 'index.html';

const renderFileSchema = z.strictObject({
  // a relative path with no `..` segment; the page names its files by it
  path: z.string().min(1).max(256),
  mediaType: z.string().min(1).max(100),
  base64: z.string(),
});

export const renderRequestSchema = z.strictObject({
  // the screen's size in CSS pixels
  width: z.int().min(1).max(20_000),
  height: z.int().min(1).max(20_000),

  // device pixels per CSS pixel
  pixelRatio: z.number().positive().max(16),

  files: z.array(renderFileSchema).max(512),
});

export type RenderRequest = z.output<typeof renderRequestSchema>;

export type RenderFile = RenderRequest['files'][number];

const renderPictureSchema = z.strictObject({
  kind: z.literal('picture'),
  base64: z.string(),

  // the URLs the page asked for that the render refused, since it fetches nothing
  refused: z.array(z.string()),
});

const renderFailureSchema = z.strictObject({ kind: z.literal('failed'), reason: z.string() });

export const renderReplySchema = z.discriminatedUnion('kind', [
  renderPictureSchema,
  renderFailureSchema,
]);

export type RenderReply = z.output<typeof renderReplySchema>;
