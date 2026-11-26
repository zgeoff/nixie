// A file as Drive holds it, with the fields the Drive tools read.
export interface DriveFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;

  // null for a Google Doc, Sheet or Slides file, which has no stored size
  readonly size: number | null;

  // RFC 3339, as Drive gives it
  readonly modifiedTime: string;

  // whether the file is shared with anyone
  readonly isShared: boolean;

  // the shared drive the file sits in; null for a file of My Drive
  readonly driveID: string | null;
  readonly isTrashed: boolean;
  readonly link: string | null;

  // the properties that only nixie's OAuth client reads, which hold nixie's markers
  readonly appProperties: Readonly<Record<string, string>>;
}

// the kinds of file the model reads, as a fixed list so a type cannot carry words
export type DriveType =
  | 'google_doc'
  | 'google_sheet'
  | 'google_slides'
  | 'folder'
  | 'text'
  | 'pdf'
  | 'image'
  | 'other';

export const driveTypes: readonly DriveType[] = [
  'google_doc',
  'google_sheet',
  'google_slides',
  'folder',
  'text',
  'pdf',
  'image',
  'other',
];
