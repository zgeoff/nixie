import { expect, test } from 'bun:test';
import { isP256Point } from './is-p256-point';
import { deriveSeededKeyPair } from './test-utils';

async function setupTest() {
  const pair = await deriveSeededKeyPair('nixie p256 point test seed');

  return { point: pair.publicKey };
}

test('it accepts a point on the curve', async () => {
  const ctx = await setupTest();

  expect(isP256Point(ctx.point)).toBeTrue();
});

test('it rejects a point that is not 65 bytes', async () => {
  const ctx = await setupTest();

  expect(isP256Point(ctx.point.subarray(0, 64))).toBeFalse();
});

test('it rejects a first byte other than 0x04', async () => {
  const ctx = await setupTest();

  const point = Uint8Array.from(ctx.point);

  point[0] = 0x02;

  expect(isP256Point(point)).toBeFalse();
});

test('it rejects a point that is off the curve', async () => {
  const ctx = await setupTest();

  const point = Uint8Array.from(ctx.point);

  point[64] = (point.at(-1) ?? 0) ^ 0x01;

  expect(isP256Point(point)).toBeFalse();
});

test('it rejects a coordinate that is not below the field prime', async () => {
  const ctx = await setupTest();

  const point = Uint8Array.from(ctx.point);

  point.fill(0xff, 1, 33);

  expect(isP256Point(point)).toBeFalse();
});
