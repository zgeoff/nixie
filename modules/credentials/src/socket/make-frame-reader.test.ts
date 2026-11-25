import { expect, test } from 'bun:test';
import { makeFrameReader } from './make-frame-reader';

test('it waits for the rest of a frame that is split across chunks', () => {
  const read = makeFrameReader(1024);
  const frame = Buffer.from([0x81, 0x03, 0x61, 0x62, 0x63]);

  expect(read(frame.subarray(0, 3))).toStrictEqual([]);

  expect(read(frame.subarray(3))).toStrictEqual([
    { opcode: 1, isFinal: true, payload: Buffer.from('abc') },
  ]);
});

test('it reads two frames from one chunk', () => {
  const read = makeFrameReader(1024);
  const frames = read(Buffer.from([0x81, 0x01, 0x61, 0x09, 0x00]));

  expect(frames.map((frame) => frame.opcode)).toStrictEqual([1, 9]);
});

test('it reads a frame with a 16-bit length', () => {
  const read = makeFrameReader(1024);
  const payload = Buffer.alloc(300, 0x61);
  const frames = read(Buffer.concat([Buffer.from([0x81, 126, 0x01, 0x2c]), payload]));

  expect(frames[0]?.payload.length).toBe(300);
});

test('it throws on a frame past the limit', () => {
  const read = makeFrameReader(4);

  expect(() => read(Buffer.from([0x81, 0x05, 0, 0, 0, 0, 0]))).toThrow('past 4');
});

test('it throws on a masked frame', () => {
  const read = makeFrameReader(1024);

  expect(() => read(Buffer.from([0x81, 0x81, 0, 0, 0, 0, 0x61]))).toThrow('masked');
});
