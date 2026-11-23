import { expect, test } from 'bun:test';
import { decodeVNCFrame } from './decode-vnc-frame';
import { encodeVNCFrame } from './encode-vnc-frame';
import { vncChunkLimitBytes } from './vnc-frame';

test.each([
  { kind: 'vnc-open', stream: 's1' } as const,
  { kind: 'vnc-close', stream: 's1' } as const,
  { kind: 'vnc-flush', stream: 's1' } as const,
  { kind: 'vnc-data', stream: 's1', data: new Uint8Array([0, 1, 254, 255]) } as const,
])('#decodeVNCFrame reads back an encoded $kind frame', (frame) => {
  expect(decodeVNCFrame(encodeVNCFrame(frame))).toStrictEqual(frame);
});

test('#decodeVNCFrame returns null for a request frame', () => {
  const request = new TextEncoder().encode(JSON.stringify({ op: 'close', tab: 't1' }));

  expect(decodeVNCFrame(request)).toBeNull();
});

test('#decodeVNCFrame returns null for a frame with an unknown field', () => {
  const frame = new TextEncoder().encode('{"kind":"vnc-open","stream":"s1","extra":1}');

  expect(decodeVNCFrame(frame)).toBeNull();
});

test('#decodeVNCFrame returns null for data that is not base64', () => {
  const frame = new TextEncoder().encode('{"kind":"vnc-data","stream":"s1","data":"!!"}');

  expect(decodeVNCFrame(frame)).toBeNull();
});

test('#decodeVNCFrame returns null for a chunk past the limit', () => {
  const data = new Uint8Array(vncChunkLimitBytes + 1);

  expect(decodeVNCFrame(encodeVNCFrame({ kind: 'vnc-data', stream: 's1', data }))).toBeNull();
});

test('#decodeVNCFrame accepts a chunk at the limit', () => {
  const data = new Uint8Array(vncChunkLimitBytes);

  expect(decodeVNCFrame(encodeVNCFrame({ kind: 'vnc-data', stream: 's1', data }))).toStrictEqual({
    kind: 'vnc-data',
    stream: 's1',
    data,
  });
});
