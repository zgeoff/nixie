import { googleDocType, googleSheetType, googleSlidesType } from './constants';
import type { DriveFile } from './types';

// An `export` is a Google file in the MIME type that Drive converts it to. A `media` request reads
// the stored bytes of any other file, as the file's own type.
export type DriveContentRequest =
  | { readonly kind: 'export'; readonly type: string }
  | { readonly kind: 'media'; readonly type: string }
  | { readonly kind: 'unsupported' };

// How a file's content is read: a Google Doc exports as Markdown, a Sheet as CSV, which holds its
// first sheet, and a Slides file as plain text. Another Google file, such as a folder, has no text.
export function pickDriveContentRequest(file: DriveFile): DriveContentRequest {
  if (file.mimeType === googleDocType) {
    return { kind: 'export', type: 'text/markdown' };
  }

  if (file.mimeType === googleSheetType) {
    return { kind: 'export', type: 'text/csv' };
  }

  if (file.mimeType === googleSlidesType) {
    return { kind: 'export', type: 'text/plain' };
  }

  return file.mimeType.startsWith('application/vnd.google-apps.')
    ? { kind: 'unsupported' }
    : { kind: 'media', type: file.mimeType };
}
