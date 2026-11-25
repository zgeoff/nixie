import { z } from 'zod';

// the most bytes of one frame in either direction: the layout's files go in, and a picture of a
// large screen comes out
export const renderFrameLimitBytes = 64 * 1024 * 1024;
export const renderEntryPath = 'index.html';

// The most files one render holds: the entry, then for each of the 36 regions of a layout its page
// and up to 20 images, which is 757 at most.
const renderFilesLimit = 1024;

// The page's own origin. Every request to it is answered from the request's files, and the render
// refuses every other.
export const renderOrigin = 'http://nixie-render.invalid/';

const renderFileSchema = z.strictObject({
  // a relative path with no `..` segment; the page names its files by it
  path: z.string().min(1).max(256),
  mediaType: z.string().min(1).max(100),
  base64: z.string(),
});

export const renderRequestSchema = z.strictObject({
  // the screen's size in device pixels, which is also the size of the picture
  width: z.int().min(1).max(20_000),
  height: z.int().min(1).max(20_000),

  // device pixels per CSS pixel, so the page's CSS size is the width divided by it
  pixelRatio: z.number().positive().max(16),

  files: z.array(renderFileSchema).max(renderFilesLimit),
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
