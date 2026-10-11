import { expect, mock, test } from 'bun:test';
import {
  decodeFetchReply,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
} from '@heynixie/wire';
import { runFetcher } from './run-fetcher';

test('it reads one request frame, however it arrives, and writes one reply frame', async () => {
  const request = {
    url: 'https://example.com/',
    limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 1, textBytes: 100 },
    deniedRanges: ['10.96.0.0/12'],
  };
  const frame = encodeFrame(encodeFetchMessage(request));
  const write = mock<(bytes: Uint8Array) => Promise<void>>(() => Promise.resolve());
  const readPageFor = mock(() => Promise.resolve({ kind: 'refused' as const, reason: 'no' }));

  await runFetcher(
    { input: [frame.slice(0, 3), frame.slice(3, 20), frame.slice(20)], write },
    readPageFor,
  );
  const written = write.mock.calls.map(([bytes]) => bytes);

  expect(readPageFor).toHaveBeenCalledExactlyOnceWith(request);
  expect(written).toHaveLength(1);
  expect(
    makeFrameDecoder(1000)(written[0] ?? new Uint8Array()).map((message) =>
      decodeFetchReply(message),
    ),
  ).toStrictEqual([{ kind: 'refused', reason: 'no' }]);
});

test('it throws when the input closes before a whole request arrives', () => {
  const frame = encodeFrame(
    encodeFetchMessage({
      url: 'https://example.com/',
      limits: { bodyBytes: 1, timeoutMs: 1, redirects: 1, textBytes: 1 },
      deniedRanges: [],
    }),
  );
  const readPageFor = mock(() => Promise.resolve({ kind: 'refused' as const, reason: 'no' }));

  expect(
    runFetcher({ input: [frame.slice(0, 10)], write: () => Promise.resolve() }, readPageFor),
  ).rejects.toThrowWithMessage(Error, 'the input closed before a whole request arrived');
  expect(readPageFor).not.toHaveBeenCalled();
});

test('it throws on a malformed request without reading a page', () => {
  const frame = encodeFrame(new TextEncoder().encode('{"url":1}'));
  const readPageFor = mock(() => Promise.resolve({ kind: 'refused' as const, reason: 'no' }));

  expect(
    runFetcher({ input: [frame], write: () => Promise.resolve() }, readPageFor),
  ).rejects.toThrow(TypeError);
  expect(readPageFor).not.toHaveBeenCalled();
});
