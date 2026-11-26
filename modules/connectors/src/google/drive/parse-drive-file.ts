import { z } from 'zod';
import type { DriveFile } from './types';

const propertiesSchema = z.record(z.string(), z.string());

const driveFileSchema = z.object({
  id: z.string(),
  name: z.string().exactOptional(),
  mimeType: z.string().exactOptional(),
  size: z.string().exactOptional(),
  modifiedTime: z.string().exactOptional(),
  shared: z.boolean().exactOptional(),
  driveId: z.string().exactOptional(),
  trashed: z.boolean().exactOptional(),
  webViewLink: z.string().exactOptional(),
  appProperties: propertiesSchema.exactOptional(),
});

// A file from Drive's answer. Null for an answer that holds no file.
export function parseDriveFile(body: unknown): DriveFile | null {
  const parsed = driveFileSchema.safeParse(body);

  if (!parsed.success) {
    return null;
  }

  const file = parsed.data;
  const size = file.size === undefined ? Number.NaN : Number(file.size);

  return {
    id: file.id,
    name: file.name ?? '',
    mimeType: file.mimeType ?? '',
    size: Number.isFinite(size) ? size : null,
    modifiedTime: file.modifiedTime ?? '',
    isShared: file.shared === true,
    driveID: file.driveId ?? null,
    isTrashed: file.trashed === true,
    link: file.webViewLink ?? null,
    appProperties: file.appProperties ?? {},
  };
}
