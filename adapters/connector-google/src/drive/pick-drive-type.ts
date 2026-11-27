import type { DriveType } from './types';

const googleTypes: Readonly<Record<string, DriveType>> = {
  'application/vnd.google-apps.document': 'google_doc',
  'application/vnd.google-apps.spreadsheet': 'google_sheet',
  'application/vnd.google-apps.presentation': 'google_slides',
  'application/vnd.google-apps.folder': 'folder',
};

// The kind of a file from its MIME type, from a fixed list.
export function pickDriveType(mimeType: string): DriveType {
  const known = googleTypes[mimeType];

  if (known !== undefined) {
    return known;
  }

  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return 'text';
  }

  if (mimeType === 'application/pdf') {
    return 'pdf';
  }

  return mimeType.startsWith('image/') ? 'image' : 'other';
}
