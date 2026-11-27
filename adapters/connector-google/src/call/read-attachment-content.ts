import { collectPageParts, fitFetchedImage } from '@heynixie/connectors';
import type { ToolImage } from '@heynixie/tools';

export const maxAttachmentBytes = 25 * 1024 * 1024;

export interface AttachmentContentLimits {
  // the most bytes of one text part
  readonly textBytes: number;

  // the most pixels of an image's longer side
  readonly imageLongEdge: number;
}

export type AttachmentContent =
  | { readonly kind: 'text'; readonly parts: readonly string[] }
  | {
      readonly kind: 'image';
      readonly image: ToolImage;
      readonly width: number;
      readonly height: number;
    }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'too_large' }
  | { readonly kind: 'unreadable'; readonly reason: string };

interface AttachmentFile {
  readonly type: string;
  readonly bytes: Uint8Array;
}

// What the model can read of a file that a Google tool fetched: `text/*` and `application/json` as
// UTF-8 text in parts, an image as an image, and every other type as unsupported. A file over 25
// MiB is too large. Gmail and Drive read files through this one function.
export async function readAttachmentContent(
  file: AttachmentFile,
  limits: AttachmentContentLimits,
): Promise<AttachmentContent> {
  if (file.bytes.byteLength > maxAttachmentBytes) {
    return { kind: 'too_large' };
  }

  const type = file.type.split(';')[0]?.trim().toLowerCase() ?? '';

  if (type.startsWith('text/') || type === 'application/json') {
    const text = new TextDecoder().decode(file.bytes);

    return { kind: 'text', parts: collectPageParts({ text, tags: [] }, limits.textBytes) };
  }

  if (type.startsWith('image/')) {
    const fitted = await fitFetchedImage(file.bytes, limits.imageLongEdge);

    return fitted.kind === 'image'
      ? { kind: 'image', image: fitted.image, width: fitted.width, height: fitted.height }
      : { kind: 'unreadable', reason: fitted.reason };
  }

  return { kind: 'unsupported' };
}
