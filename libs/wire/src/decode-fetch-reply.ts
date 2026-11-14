import type { FetchReply } from './fetch-reply';
import { parseFetchObject } from './parse-fetch-object';

export function decodeFetchReply(bytes: Uint8Array): FetchReply {
  const reply = parseFetchObject(bytes, 'reply');
  const kind = reply['kind'];
  const isGated = isReplyGated(reply);

  if (kind === 'refused' || kind === 'failed') {
    return { kind, reason: requireString(reply, 'reason'), isGated };
  }

  if (kind === 'image') {
    return {
      kind,
      url: requireString(reply, 'url'),
      status: requireStatus(reply),
      contentType: requireStringOrNull(reply, 'contentType'),
      base64: requireString(reply, 'base64'),
      retryAfterMs: requireRetryAfterMs(reply),
      isGated,
    };
  }

  if (kind !== 'page') {
    throw new TypeError('a fetch reply needs a kind of page, image, refused or failed');
  }

  return {
    kind,
    url: requireString(reply, 'url'),
    status: requireStatus(reply),
    contentType: requireStringOrNull(reply, 'contentType'),
    text: requireStringOrNull(reply, 'text'),
    links: requireStrings(reply, 'links'),
    isTruncated: requireBoolean(reply, 'isTruncated'),
    blocked: requireStringOrNull(reply, 'blocked'),
    retryAfterMs: requireRetryAfterMs(reply),
    isGated,
  };
}

function isReplyGated(reply: Readonly<Record<string, unknown>>): boolean {
  const value = reply['isGated'];

  if (value === undefined) {
    return false;
  }

  if (typeof value !== 'boolean') {
    throw new TypeError('a fetch reply needs isGated, a boolean');
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

function requireStatus(reply: Readonly<Record<string, unknown>>): number {
  const status = reply['status'];

  if (typeof status !== 'number' || !Number.isInteger(status) || status < 100 || status > 999) {
    throw new TypeError('a fetch reply needs a status, a whole number from 100 to 999');
  }

  return status;
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

function requireRetryAfterMs(reply: Readonly<Record<string, unknown>>): number | null {
  const value = reply['retryAfterMs'];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError('a fetch reply needs retryAfterMs, a whole number of 0 or more, or null');
  }

  return value;
}

function requireStrings(reply: Readonly<Record<string, unknown>>, name: string): string[] {
  const value: unknown = reply[name];
  const items: readonly unknown[] = Array.isArray(value) ? value : [];
  const strings = items.filter((item): item is string => typeof item === 'string');

  if (!Array.isArray(value) || strings.length !== items.length) {
    throw new TypeError(`a fetch reply needs ${name}, a list of strings`);
  }

  return strings;
}

// oxlint-disable-next-line zgeoff/verb-contract -- it returns a field's value, not a yes/no answer
function requireBoolean(reply: Readonly<Record<string, unknown>>, name: string): boolean {
  const value = reply[name];

  if (typeof value !== 'boolean') {
    throw new TypeError(`a fetch reply needs ${name}, a boolean`);
  }

  return value;
}
