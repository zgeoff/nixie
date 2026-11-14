import { expect, test } from 'bun:test';
import type { FetchReply } from '@heynixie/wire';
import { isRateLimitReply } from './is-rate-limit-reply';

test.each([
  [
    'a 429',
    {
      kind: 'page',
      url: 'https://bakery.test/menu',
      status: 429,
      contentType: 'text/html',
      text: 'Menu',
      links: [],
      isTruncated: false,
      blocked: null,
      retryAfterMs: null,
      isGated: false,
    } satisfies FetchReply,
  ],
  [
    'a 503',
    {
      kind: 'page',
      url: 'https://bakery.test/menu',
      status: 503,
      contentType: 'text/html',
      text: 'Menu',
      links: [],
      isTruncated: false,
      blocked: null,
      retryAfterMs: null,
      isGated: false,
    } satisfies FetchReply,
  ],
  [
    'a 403 with a retry wait',
    {
      kind: 'page',
      url: 'https://bakery.test/menu',
      status: 403,
      contentType: 'text/html',
      text: 'Menu',
      links: [],
      isTruncated: false,
      blocked: null,
      retryAfterMs: 5000,
      isGated: false,
    } satisfies FetchReply,
  ],
  [
    'an image 429',
    {
      kind: 'image',
      url: 'https://bakery.test/a.png',
      status: 429,
      contentType: 'image/png',
      base64: '',
      retryAfterMs: null,
      isGated: false,
    } satisfies FetchReply,
  ],
])('it accepts %s', (_name, reply) => {
  expect(isRateLimitReply(reply)).toBeTrue();
});

test.each([
  [
    'a 403 with no retry wait',
    {
      kind: 'page',
      url: 'https://bakery.test/menu',
      status: 403,
      contentType: 'text/html',
      text: 'Menu',
      links: [],
      isTruncated: false,
      blocked: null,
      retryAfterMs: null,
      isGated: false,
    } satisfies FetchReply,
  ],
  [
    'a 403 with a blocked reason and a retry wait',
    {
      kind: 'page',
      url: 'https://bakery.test/menu',
      status: 403,
      contentType: 'text/html',
      text: 'Menu',
      links: [],
      isTruncated: false,
      blocked: 'challenge',
      retryAfterMs: 5000,
      isGated: false,
    } satisfies FetchReply,
  ],
  [
    'a 503 with a blocked reason',
    {
      kind: 'page',
      url: 'https://bakery.test/menu',
      status: 503,
      contentType: 'text/html',
      text: 'Menu',
      links: [],
      isTruncated: false,
      blocked: 'challenge',
      retryAfterMs: null,
      isGated: false,
    } satisfies FetchReply,
  ],
  [
    'a 200',
    {
      kind: 'page',
      url: 'https://bakery.test/menu',
      status: 200,
      contentType: 'text/html',
      text: 'Menu',
      links: [],
      isTruncated: false,
      blocked: null,
      retryAfterMs: 5000,
      isGated: false,
    } satisfies FetchReply,
  ],
  ['a refused reply', { kind: 'refused', reason: 'no', isGated: false } satisfies FetchReply],
  ['a failed reply', { kind: 'failed', reason: 'no', isGated: false } satisfies FetchReply],
])('it rejects %s', (_name, reply) => {
  expect(isRateLimitReply(reply)).toBeFalse();
});
