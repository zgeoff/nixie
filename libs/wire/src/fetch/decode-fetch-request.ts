import type { FetchLimits, FetchMode, FetchRequest } from './fetch-request';
import { parseFetchObject } from './parse-fetch-object';

export function decodeFetchRequest(bytes: Uint8Array): FetchRequest {
  const request = parseFetchObject(bytes, 'request');
  const limits = request['limits'];
  const deniedRanges = request['deniedRanges'];

  if (typeof request['url'] !== 'string') {
    throw new TypeError('a fetch request needs a url string');
  }

  if (!isStringList(deniedRanges)) {
    throw new TypeError('a fetch request needs deniedRanges, a list of strings');
  }

  const decoded = decodeLimits(limits);
  const html = { ...decodeHTML(request['html']), ...decodeMode(request['mode']) };

  if (!('hopGate' in request)) {
    return { url: request['url'], limits: decoded, deniedRanges, hops: 'none', ...html };
  }

  return {
    url: request['url'],
    limits: { ...decoded, redirects: decodeHopGateRedirects(request['hopGate']) },
    deniedRanges,
    hops: 'ask',
    ...html,
  };
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}

const limitNames = ['bodyBytes', 'timeoutMs', 'redirects', 'textBytes', 'imageBytes'] as const;

function decodeLimits(value: unknown): FetchLimits {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('a fetch request needs limits');
  }

  const limits: ReadonlyMap<string, unknown> = new Map(Object.entries(value));

  for (const name of limitNames) {
    const limit = limits.get(name);

    if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0) {
      throw new TypeError(`a fetch request needs limits.${name}, a whole number of 0 or more`);
    }
  }

  return {
    bodyBytes: Number(limits.get('bodyBytes')),
    timeoutMs: Number(limits.get('timeoutMs')),
    redirects: Number(limits.get('redirects')),
    textBytes: Number(limits.get('textBytes')),
    imageBytes: Number(limits.get('imageBytes')),
  };
}

function decodeHTML(value: unknown): { readonly html?: string } {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== 'string') {
    throw new TypeError('a fetch request needs html, a string, when it holds one');
  }

  return { html: value };
}

function decodeMode(value: unknown): { readonly mode?: FetchMode } {
  if (value === undefined) {
    return {};
  }

  const mode: Readonly<Record<string, unknown>> =
    typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};

  if (mode['kind'] === 'body') {
    return { mode: { kind: 'body' } };
  }

  if (
    mode['kind'] === 'package' &&
    typeof mode['integrity'] === 'string' &&
    typeof mode['unpackedBytes'] === 'number' &&
    Number.isSafeInteger(mode['unpackedBytes']) &&
    mode['unpackedBytes'] > 0
  ) {
    return {
      mode: { kind: 'package', integrity: mode['integrity'], unpackedBytes: mode['unpackedBytes'] },
    };
  }

  throw new TypeError('a fetch request needs mode, a body or a package with integrity and bytes');
}

function decodeHopGateRedirects(value: unknown): number {
  const redirects: unknown =
    typeof value === 'object' && value !== null
      ? Object.fromEntries(Object.entries(value))['redirects']
      : undefined;

  if (typeof redirects !== 'number' || !Number.isSafeInteger(redirects) || redirects < 0) {
    throw new TypeError('a fetch request needs hopGate.redirects, a whole number of 0 or more');
  }

  return redirects;
}
