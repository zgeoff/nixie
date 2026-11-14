import { expect, test } from 'bun:test';
import { encodeFetchMessage } from './encode-fetch-message';

test('it writes the message as one line of JSON', () => {
  const bytes = encodeFetchMessage({
    kind: 'page',
    url: 'https://example.com/',
    status: 200,
    contentType: 'text/plain',
    text: 'a\nb',
    links: [],
    isTruncated: false,
    blocked: null,
    retryAfterMs: null,
    isGated: false,
  });

  expect(new TextDecoder().decode(bytes)).toBe(
    String.raw`{"kind":"page","url":"https://example.com/","status":200,"contentType":"text/plain","text":"a\nb","links":[],"isTruncated":false,"blocked":null,"retryAfterMs":null,"isGated":false}`,
  );
});

test('it writes a request that is not gated as the bytes a server of the release before sent', () => {
  const limits = {
    bodyBytes: 100,
    timeoutMs: 1000,
    redirects: 3,
    textBytes: 50,
    imageBytes: 100,
  };

  const bytes = encodeFetchMessage({
    url: 'https://example.com/',
    limits,
    deniedRanges: ['10.0.0.0/8'],
    hops: 'none',
  });

  expect(new TextDecoder().decode(bytes)).toBe(
    JSON.stringify({ url: 'https://example.com/', limits, deniedRanges: ['10.0.0.0/8'] }),
  );
});

test('it writes a gated request with no redirects and a hopGate that holds the limit', () => {
  const bytes = encodeFetchMessage({
    url: 'https://example.com/',
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 3, textBytes: 50, imageBytes: 100 },
    deniedRanges: ['10.0.0.0/8'],
    hops: 'ask',
  });

  expect(JSON.parse(new TextDecoder().decode(bytes))).toStrictEqual({
    url: 'https://example.com/',
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 0, textBytes: 50, imageBytes: 100 },
    deniedRanges: ['10.0.0.0/8'],
    hopGate: { redirects: 3 },
  });
});

test.each([
  [
    { kind: 'hop', url: 'https://example.com/next' } as const,
    '{"kind":"hop","url":"https://example.com/next"}',
  ],
  [{ kind: 'hop-pass' } as const, '{"kind":"hop-pass"}'],
])('it writes the frame %j', (frame, json) => {
  expect(new TextDecoder().decode(encodeFetchMessage(frame))).toBe(json);
});
