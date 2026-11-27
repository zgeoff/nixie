import type { StoredFile } from './types';

// A file as Drive's API answers: the metadata the tools ask for. A Google file has no `size`.
export function buildFakeFileJSON(file: StoredFile): Record<string, unknown> {
  const isGoogleFile = file.mimeType.startsWith('application/vnd.google-apps.');

  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    ...(isGoogleFile ? {} : { size: String(file.bytes.byteLength) }),
    modifiedTime: file.modifiedTime,
    version: file.version,
    shared: file.isShared,
    ...(file.driveID === null ? {} : { driveId: file.driveID }),
    trashed: file.isTrashed,
    webViewLink: `https://drive.google.com/file/d/${file.id}/view`,
    appProperties: file.appProperties,
  };
}
