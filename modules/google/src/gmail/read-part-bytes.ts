import type { ConnectorContext } from '@heynixie/connections';
import type { GoogleHosts } from '../types';
import { callGmail } from './call-gmail';
import type { GmailPart } from './types';

export type PartBytes =
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly kind: 'failed'; readonly reason: string };

interface PartRequest {
  readonly message: string;
  readonly part: GmailPart;
}

// The bytes of a message part: its inline body, or the attachment body that Gmail keeps apart.
export async function readPartBytes(
  hosts: GoogleHosts,
  context: ConnectorContext,
  request: PartRequest,
): Promise<PartBytes> {
  const part = request.part;

  if (part.data !== null) {
    return { kind: 'bytes', bytes: new Uint8Array(Buffer.from(part.data, 'base64url')) };
  }

  if (part.attachmentID === null) {
    return { kind: 'bytes', bytes: new Uint8Array(0) };
  }

  const reply = await callGmail(hosts, context, {
    path: `/messages/${encodeURIComponent(request.message)}/attachments/${encodeURIComponent(part.attachmentID)}`,
  });

  if (reply.kind === 'error') {
    return { kind: 'failed', reason: reply.reason };
  }

  const data =
    typeof reply.body === 'object' && reply.body !== null && 'data' in reply.body
      ? reply.body.data
      : null;

  return typeof data === 'string'
    ? { kind: 'bytes', bytes: new Uint8Array(Buffer.from(data, 'base64url')) }
    : { kind: 'failed', reason: 'Gmail answered with no attachment data' };
}
