import type { ConnectorContext } from '../../types';
import { callGoogle } from '../call-google';
import type { GoogleHosts } from '../google-hosts';
import { driveFileFields } from './constants';
import { parseDriveFile } from './parse-drive-file';
import type { DriveFile } from './types';

export type DriveFileRead =
  | { readonly kind: 'file'; readonly file: DriveFile }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed'; readonly reason: string; readonly retryAfterMs: number | null };

// Reads one file's metadata live. A 404 is a value, and any other failure carries Google's reason.
export async function readDriveFile(
  hosts: GoogleHosts,
  context: ConnectorContext,
  id: string,
): Promise<DriveFileRead> {
  const reply = await callGoogle(hosts, context, {
    path: `/drive/v3/files/${encodeURIComponent(id)}`,
    query: { fields: driveFileFields, supportsAllDrives: 'true' },
  });

  if (reply.kind === 'error') {
    return reply.status === 404
      ? { kind: 'missing' }
      : { kind: 'failed', reason: reply.reason, retryAfterMs: reply.retryAfterMs };
  }

  const file = parseDriveFile(reply.body);

  return file === null
    ? { kind: 'failed', reason: 'Google answered with no file', retryAfterMs: null }
    : { kind: 'file', file };
}
