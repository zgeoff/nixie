import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { z } from 'zod';
import { decodeCaptureTag } from './decode-capture-tag';
import { encodeBase64URL } from './encode-base64url';
import { encodeCaptureTag } from './encode-capture-tag';
import { deriveSeededKeyPair } from './test-utils';

async function setupTest() {
  const path = join(import.meta.dir, '..', 'turn-input-formats', '1', 'capture-tag.json');

  const json: unknown = await Bun.file(path).json();

  const fixture = z
    .strictObject({ keySeed: z.string(), captureID: z.string(), segment: z.string() })
    .parse(json);

  const pair = await deriveSeededKeyPair(fixture.keySeed);

  return { fixture, pair };
}

test('it encodes the committed segment from the capture ID and the derived public key', async () => {
  const ctx = await setupTest();

  expect(encodeCaptureTag({ captureID: ctx.fixture.captureID, sealTo: ctx.pair.publicKey })).toBe(
    ctx.fixture.segment,
  );
});

test('it decodes the committed segment to its capture ID and the derived public key', async () => {
  const ctx = await setupTest();

  expect(decodeCaptureTag(ctx.fixture.segment)).toStrictEqual({
    captureID: ctx.fixture.captureID,
    sealTo: ctx.pair.publicKey,
  });
});

test('it returns a key that WebCrypto imports as a P-256 public key', async () => {
  const ctx = await setupTest();

  const tag = decodeCaptureTag(ctx.fixture.segment);

  expect(tag).not.toBeNull();

  const imported = crypto.subtle.importKey(
    'raw',
    new Uint8Array(tag?.sealTo ?? []),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  await expect(imported).resolves.toBeDefined();
});

test('it returns null for a segment with no dot', async () => {
  const ctx = await setupTest();

  expect(decodeCaptureTag(ctx.fixture.captureID)).toBeNull();
});

test('it returns null for a segment with 2 dots', async () => {
  const ctx = await setupTest();

  expect(decodeCaptureTag(`${ctx.fixture.segment}.x`)).toBeNull();
});

test('it returns null for a capture ID that is not a lowercase version 4 UUID', async () => {
  const ctx = await setupTest();

  const key = encodeBase64URL(ctx.pair.publicKey);

  expect([
    decodeCaptureTag(`${ctx.fixture.captureID.toUpperCase()}.${key}`),
    decodeCaptureTag(`3f9c2a54-7b1e-1d68-9a0f-5e2c81b6d7a3.${key}`),
    decodeCaptureTag(`not-a-uuid.${key}`),
  ]).toStrictEqual([null, null, null]);
});

test('it returns null for a key that is not 65 bytes', async () => {
  const ctx = await setupTest();

  const short = encodeBase64URL(ctx.pair.publicKey.slice(0, 33));

  expect(decodeCaptureTag(`${ctx.fixture.captureID}.${short}`)).toBeNull();
});

test('it returns null for padded or non-base64url key text', async () => {
  const ctx = await setupTest();

  const key = encodeBase64URL(ctx.pair.publicKey);

  expect([
    decodeCaptureTag(`${ctx.fixture.captureID}.${key}=`),
    decodeCaptureTag(`${ctx.fixture.captureID}.${key.replaceAll('-', '+')}`),
  ]).toStrictEqual([null, null]);
});

test('it returns null for a key whose first byte is not 0x04', async () => {
  const ctx = await setupTest();

  const key = Uint8Array.from(ctx.pair.publicKey);

  key[0] = 0x02;

  expect(decodeCaptureTag(`${ctx.fixture.captureID}.${encodeBase64URL(key)}`)).toBeNull();
});

test('it returns null for a coordinate that is not below the field prime', async () => {
  const ctx = await setupTest();

  const key = new Uint8Array(65).fill(0xff);

  key[0] = 0x04;

  expect(decodeCaptureTag(`${ctx.fixture.captureID}.${encodeBase64URL(key)}`)).toBeNull();
});

test('it returns null for a point that is not on the curve', async () => {
  const ctx = await setupTest();

  const key = Uint8Array.from(ctx.pair.publicKey);

  key[64] = (key[64] ?? 0) ^ 1;

  expect(decodeCaptureTag(`${ctx.fixture.captureID}.${encodeBase64URL(key)}`)).toBeNull();
});
