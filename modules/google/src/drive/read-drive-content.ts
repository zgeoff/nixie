import type { ConnectorContext } from '@heynixie/connections';
import { callGoogle } from '../call/call-google';
import type { GoogleHosts } from '../types';
import type { DriveContentRequest } from './pick-drive-content-request';

export type DriveContentRead =
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  | { readonly kind: 'failed'; readonly reason: string };

interface ContentRequest {
  readonly id: string;
  readonly request: Extract<DriveContentRequest, { readonly kind: 'export' | 'media' }>;
}

// Reads a file's content live: an export of a Google file, or the stored bytes of another file.
export async function readDriveContent(
  hosts: GoogleHosts,
  context: ConnectorContext,
  content: ContentRequest,
): Promise<DriveContentRead> {
  const path = `/drive/v3/files/${encodeURIComponent(content.id)}`;

  const reply =
    content.request.kind === 'export'
      ? await callGoogle(hosts, context, {
          path: `${path}/export`,
          query: { mimeType: content.request.type },
        })
      : await callGoogle(hosts, context, {
          path,
          query: { alt: 'media', supportsAllDrives: 'true' },
        });

  return reply.kind === 'ok'
    ? { kind: 'bytes', bytes: reply.bytes }
    : { kind: 'failed', reason: reply.reason };
}
