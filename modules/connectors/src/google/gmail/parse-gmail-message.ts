import { z } from 'zod';
import type { GmailMessage, GmailPart } from './types';

const recordSchema = z.record(z.string(), z.unknown());

// Reads a Gmail message of `format=full` or `format=metadata`, or null when the JSON is no message.
export function parseGmailMessage(value: unknown): GmailMessage | null {
  const record = recordSchema.safeParse(value);

  if (!record.success) {
    return null;
  }

  const id = pickText(record.data, 'id');
  const payload = parsePart(record.data['payload'], 0);

  if (id === null || payload === null) {
    return null;
  }

  const labels = record.data['labelIds'];

  return {
    id,
    threadID: pickText(record.data, 'threadId') ?? id,
    labels: Array.isArray(labels)
      ? labels.filter((label): label is string => typeof label === 'string')
      : [],
    snippet: pickText(record.data, 'snippet') ?? '',
    internalDateMs: Number(pickText(record.data, 'internalDate') ?? 0),
    payload,
  };
}

function pickText(record: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = record[key];

  return typeof value === 'string' ? value : null;
}

const maxDepth = 20;

function parsePart(value: unknown, depth: number): GmailPart | null {
  const record = recordSchema.safeParse(value);

  if (!record.success || depth > maxDepth) {
    return null;
  }

  const body = recordSchema.safeParse(record.data['body']);
  const sizeText = body.success ? body.data['size'] : undefined;
  const parts = record.data['parts'];

  return {
    partID: pickText(record.data, 'partId') ?? '0',
    mimeType: (pickText(record.data, 'mimeType') ?? 'text/plain').toLowerCase(),
    filename: pickText(record.data, 'filename') ?? '',
    headers: parseHeaders(record.data['headers']),
    size: typeof sizeText === 'number' ? sizeText : 0,
    data: body.success ? pickText(body.data, 'data') : null,
    attachmentID: body.success ? pickText(body.data, 'attachmentId') : null,
    parts: Array.isArray(parts)
      ? parts.flatMap((part) => {
          const parsed = parsePart(part, depth + 1);

          return parsed === null ? [] : [parsed];
        })
      : [],
  };
}

// The first header of a name wins, and a name reads in lowercase.
function parseHeaders(value: unknown): ReadonlyMap<string, string> {
  const headers = new Map<string, string>();

  if (!Array.isArray(value)) {
    return headers;
  }

  for (const entry of value) {
    const record = recordSchema.safeParse(entry);
    const name = record.success ? pickText(record.data, 'name') : null;
    const text = record.success ? pickText(record.data, 'value') : null;

    if (name !== null && text !== null && !headers.has(name.toLowerCase())) {
      headers.set(name.toLowerCase(), text);
    }
  }

  return headers;
}
