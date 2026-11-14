import { expect, test } from 'bun:test';
import { decodeFetchRequest } from './decode-fetch-request';

test('it returns a request with its limits and its denied ranges', () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      url: 'https://example.com/',
      limits: {
        bodyBytes: 2_097_152,
        timeoutMs: 15_000,
        redirects: 5,
        textBytes: 262_144,
        imageBytes: 2_097_152,
      },
      deniedRanges: ['10.96.0.0/12'],
    }),
  );

  expect(decodeFetchRequest(bytes)).toStrictEqual({
    url: 'https://example.com/',
    limits: {
      bodyBytes: 2_097_152,
      timeoutMs: 15_000,
      redirects: 5,
      textBytes: 262_144,
      imageBytes: 2_097_152,
    },
    deniedRanges: ['10.96.0.0/12'],
    hops: 'none',
  });
});

test('it refuses a request with no image limit', () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      url: 'https://example.com/',
      limits: { bodyBytes: 2_097_152, timeoutMs: 15_000, redirects: 5, textBytes: 262_144 },
      deniedRanges: [],
    }),
  );

  expect(() => decodeFetchRequest(bytes)).toThrowWithMessage(TypeError, /limits\.imageBytes/u);
});

test('it refuses a request with no url', () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      limits: {
        bodyBytes: 2_097_152,
        timeoutMs: 15_000,
        redirects: 5,
        textBytes: 262_144,
        imageBytes: 2_097_152,
      },
      deniedRanges: [],
    }),
  );

  expect(() => decodeFetchRequest(bytes)).toThrowWithMessage(TypeError, /url string/u);
});

test('it refuses a request whose limit is not a whole number', () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      url: 'https://example.com/',
      limits: {
        bodyBytes: 2_097_152,
        timeoutMs: 1.5,
        redirects: 5,
        textBytes: 262_144,
        imageBytes: 2_097_152,
      },
      deniedRanges: [],
    }),
  );

  expect(() => decodeFetchRequest(bytes)).toThrowWithMessage(TypeError, /limits\.timeoutMs/u);
});

test('it refuses a request with no limits', () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ url: 'https://example.com/', deniedRanges: [] }),
  );

  expect(() => decodeFetchRequest(bytes)).toThrowWithMessage(TypeError, /needs limits$/u);
});

test('it refuses a request whose denied ranges are not strings', () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      url: 'https://example.com/',
      limits: {
        bodyBytes: 2_097_152,
        timeoutMs: 15_000,
        redirects: 5,
        textBytes: 262_144,
        imageBytes: 2_097_152,
      },
      deniedRanges: [10],
    }),
  );

  expect(() => decodeFetchRequest(bytes)).toThrowWithMessage(TypeError, /deniedRanges/u);
});

test('it reads a request with hopGate as an ask request with the real redirect limit', () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      url: 'https://example.com/',
      limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 0, textBytes: 100, imageBytes: 100 },
      deniedRanges: [],
      hopGate: { redirects: 5 },
    }),
  );

  expect(decodeFetchRequest(bytes)).toStrictEqual({
    url: 'https://example.com/',
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 5, textBytes: 100, imageBytes: 100 },
    deniedRanges: [],
    hops: 'ask',
  });
});

test.each([
  ['a string', 'ten'],
  ['a missing redirect count', {}],
  ['a negative redirect count', { redirects: -1 }],
  ['a fractional redirect count', { redirects: 1.5 }],
  ['null', null],
])('it refuses a hopGate that holds %s', (_label, hopGate) => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      url: 'https://example.com/',
      limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 0, textBytes: 100, imageBytes: 100 },
      deniedRanges: [],
      hopGate,
    }),
  );

  expect(() => decodeFetchRequest(bytes)).toThrowWithMessage(TypeError, /hopGate\.redirects/u);
});
