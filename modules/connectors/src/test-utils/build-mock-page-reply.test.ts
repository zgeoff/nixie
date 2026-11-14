import { expect, test } from 'bun:test';
import { buildMockPageReply } from './build-mock-page-reply';

test('it builds a 200 text page for the URL', () => {
  expect(buildMockPageReply('https://site.test/')).toStrictEqual({
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url: 'https://site.test/',
    status: 200,
    contentType: 'text/plain',
    text: 'A page',
    links: [],
    isTruncated: false,
    blocked: null,
  });
});

test('it lets an override replace a field', () => {
  expect(buildMockPageReply('https://site.test/', { status: 404 }).status).toBe(404);
});
