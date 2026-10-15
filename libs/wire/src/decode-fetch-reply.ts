import type { FetchReply } from './fetch-reply';
import { parseFetchObject } from './parse-fetch-object';

// Decodes the fetcher's reply, and throws on a malformed one. The fetcher parses hostile pages, so
// nixie reads its reply as untrusted bytes and keeps only the fields of a well-formed reply.
export function decodeFetchReply(bytes: Uint8Array): FetchReply {
  const reply = parseFetchObject(bytes, 'reply');
  const kind = reply['kind'];

  if (kind === 'refused' || kind === 'failed') {
    return { kind, reason: requireString(reply, 'reason') };
  }

  if (kind !== 'page') {
    throw new TypeError('a fetch reply needs a kind of page, refused or failed');
  }

  return {
    kind,
    url: requireString(reply, 'url'),
    status: requireStatus(reply),
    contentType: requireStringOrNull(reply, 'contentType'),
    text: requireStringOrNull(reply, 'text'),
    isTruncated: requireBoolean(reply, 'isTruncated'),
    blocked: requireStringOrNull(reply, 'blocked'),
  };
}

function requireStatus(reply: Readonly<Record<string, unknown>>): number {
  const status = reply['status'];

  if (typeof status !== 'number' || !Number.isInteger(status) || status < 100 || status > 999) {
    throw new TypeError('a fetch reply needs a status, a whole number from 100 to 999');
  }

  return status;
}

function requireBoolean(reply: Readonly<Record<string, unknown>>, name: string): boolean {
  const value = reply[name];

  if (typeof value !== 'boolean') {
    throw new TypeError(`a fetch reply needs ${name}, a boolean`);
  }

  return value;
}

function requireString(reply: Readonly<Record<string, unknown>>, name: string): string {
  const value = reply[name];

  if (typeof value !== 'string') {
    throw new TypeError(`a fetch reply needs ${name}, a string`);
  }

  return value;
}

function requireStringOrNull(
  reply: Readonly<Record<string, unknown>>,
  name: string,
): string | null {
  const value = reply[name];

  if (value !== null && typeof value !== 'string') {
    throw new TypeError(`a fetch reply needs ${name}, a string or null`);
  }

  return value;
}
