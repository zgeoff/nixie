import { expect, test } from 'bun:test';
import { decodeFetchRequest } from './decode-fetch-request';

const encoder = new TextEncoder();

test('it returns a request with its limits and its denied ranges', () => {
  const bytes = encoder.encode(
    JSON.stringify({
      url: 'https://example.com/',
      limits: { bodyBytes: 2_097_152, timeoutMs: 15_000, redirects: 5, textBytes: 262_144 },
      deniedRanges: ['10.96.0.0/12'],
    }),
  );

  expect(decodeFetchRequest(bytes)).toStrictEqual({
    url: 'https://example.com/',
    limits: { bodyBytes: 2_097_152, timeoutMs: 15_000, redirects: 5, textBytes: 262_144 },
    deniedRanges: ['10.96.0.0/12'],
  });
});

test('it refuses a request with no url', () => {
  const bytes = encoder.encode(
    JSON.stringify({
      limits: { bodyBytes: 2_097_152, timeoutMs: 15_000, redirects: 5, textBytes: 262_144 },
      deniedRanges: [],
    }),
  );

  expect(() => decodeFetchRequest(bytes)).toThrowWithMessage(TypeError, /url string/u);
});

test('it refuses a request whose limit is not a whole number', () => {
  const bytes = encoder.encode(
    JSON.stringify({
      url: 'https://example.com/',
      limits: { bodyBytes: 2_097_152, timeoutMs: 1.5, redirects: 5, textBytes: 262_144 },
      deniedRanges: [],
    }),
  );

  expect(() => decodeFetchRequest(bytes)).toThrowWithMessage(TypeError, /limits\.timeoutMs/u);
});

test('it refuses a request with no limits', () => {
  const bytes = encoder.encode(JSON.stringify({ url: 'https://example.com/', deniedRanges: [] }));

  expect(() => decodeFetchRequest(bytes)).toThrowWithMessage(TypeError, /needs limits$/u);
});

test('it refuses a request whose denied ranges are not strings', () => {
  const bytes = encoder.encode(
    JSON.stringify({
      url: 'https://example.com/',
      limits: { bodyBytes: 2_097_152, timeoutMs: 15_000, redirects: 5, textBytes: 262_144 },
      deniedRanges: [10],
    }),
  );

  expect(() => decodeFetchRequest(bytes)).toThrowWithMessage(TypeError, /deniedRanges/u);
});
