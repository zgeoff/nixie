import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { z } from 'zod';
import { encodeBase64URL } from './encode-base64url';
import { openSpoolFile } from './open-spool-file';
import { parseBase64URL } from './parse-base64url';
import { sealSpoolBody } from './seal-spool-body';
import {
  buildFileWithHeader,
  createSpoolRecipient,
  deriveSeededKeyPair,
  parseSealedHeader,
} from './test-utils';

async function setupTest() {
  const path = join(import.meta.dir, '..', 'turn-input-formats', '1', 'spool-file.json');

  const json: unknown = await Bun.file(path).json();

  const fixture = z
    .strictObject({
      keySeed: z.string(),
      sealed: z.string(),
      expected: z.strictObject({
        version: z.literal(1),
        captureID: z.string(),
        writer: z.string(),
        counter: z.number(),
        receivedAt: z.number(),
        route: z.string(),
        api: z.literal('anthropic-messages'),
        endpoint: z.literal('messages'),
        bytes: z.number(),
      }),
      body: z.string(),
    })
    .parse(json);

  const sealed = new Uint8Array(Buffer.from(fixture.sealed, 'base64'));

  const pair = await deriveSeededKeyPair(fixture.keySeed);

  return { fixture, sealed, pair, captureID: fixture.expected.captureID };
}

test('it opens the committed file to the header it holds and the expected body', async () => {
  const ctx = await setupTest();

  const header = parseSealedHeader(ctx.sealed);

  const opened = await openSpoolFile(ctx.sealed, ctx.pair.privateKey);

  const actual: unknown = opened?.header;

  expect(actual).toStrictEqual(header);
  expect(new TextDecoder().decode(opened?.body)).toBe(ctx.fixture.body);
});

test('it writes the header keys in the order of the design', async () => {
  const ctx = await setupTest();

  expect(Object.keys(parseSealedHeader(ctx.sealed))).toStrictEqual([
    'version',
    'captureID',
    'writer',
    'counter',
    'receivedAt',
    'route',
    'api',
    'endpoint',
    'bytes',
    'ephemeralKey',
    'iv',
  ]);
});

test('it holds an ephemeral key of 65 bytes that imports, and an IV of 12 bytes', async () => {
  const ctx = await setupTest();

  const header = parseSealedHeader(ctx.sealed);
  const key = parseBase64URL(String(header['ephemeralKey']));
  const iv = parseBase64URL(String(header['iv']));

  expect(key?.length).toBe(65);
  expect(iv?.length).toBe(12);

  expect(
    crypto.subtle.importKey(
      'raw',
      key ?? new Uint8Array(),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    ),
  ).resolves.toBeDefined();
});

test('it holds the key-free header fields of the fixture', async () => {
  const ctx = await setupTest();

  const { ephemeralKey: _key, iv: _iv, ...keyFree } = parseSealedHeader(ctx.sealed);

  expect(keyFree).toStrictEqual(ctx.fixture.expected);
});

test('it round-trips a body sealed to a key pair made in the test', async () => {
  const captureID = '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3';

  const recipient = await createSpoolRecipient();

  const body = new TextEncoder().encode('name three quay cranes');

  const header = {
    version: 1,
    captureID,
    writer: 'ab',
    counter: 2,
    receivedAt: 1_798_761_600_000,
    route: 'harbour',
    api: 'openai-responses',
    endpoint: 'responses',
    bytes: body.length,
  } as const;

  const file = await sealSpoolBody({ captureID, sealTo: recipient.sealTo }, header, body);
  const opened = await openSpoolFile(file, recipient.privateKey);

  expect(opened).toStrictEqual({
    header: { ...header, ephemeralKey: expect.any(String), iv: expect.any(String) },
    body,
  });
});

test('it seals one body under 2 different ephemeral keys and IVs', async () => {
  const ctx = await setupTest();

  const body = new TextEncoder().encode(ctx.fixture.body);

  const tag = { captureID: ctx.captureID, sealTo: ctx.pair.publicKey };

  const firstFile = await sealSpoolBody(tag, ctx.fixture.expected, body);
  const secondFile = await sealSpoolBody(tag, ctx.fixture.expected, body);

  const first = parseSealedHeader(firstFile);
  const second = parseSealedHeader(secondFile);

  expect([
    first['ephemeralKey'] === second['ephemeralKey'],
    first['iv'] === second['iv'],
  ]).toStrictEqual([false, false]);
});

test('it opens to null when one byte of the ciphertext is flipped', async () => {
  const ctx = await setupTest();

  const file = Uint8Array.from(ctx.sealed);

  file[file.length - 20] = (file.at(-20) ?? 0) ^ 1;

  const opened = await openSpoolFile(file, ctx.pair.privateKey);

  expect(opened).toBeNull();
});

test.each([
  ['captureID', '4f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3'],
  ['writer', 'a1b2c3d4e5f60719'],
  ['counter', 4],
  ['receivedAt', 1_798_761_600_001],
  ['route', 'quay'],
  ['api', 'openai-responses'],
  ['endpoint', 'responses'],
  ['bytes', 107],
])('it opens to null when the header field %s is changed', async (field, value) => {
  const ctx = await setupTest();

  const file = buildFileWithHeader(ctx.sealed, {
    ...parseSealedHeader(ctx.sealed),
    [field]: value,
  });

  const opened = await openSpoolFile(file, ctx.pair.privateKey);

  expect(opened).toBeNull();
});

test('it opens to null when the ephemeral key is swapped for another valid key', async () => {
  const ctx = await setupTest();
  const other = await deriveSeededKeyPair('another invented seed');

  const file = buildFileWithHeader(ctx.sealed, {
    ...parseSealedHeader(ctx.sealed),
    ephemeralKey: encodeBase64URL(other.publicKey),
  });

  const opened = await openSpoolFile(file, ctx.pair.privateKey);

  expect(opened).toBeNull();
});

test('it opens to null when the IV is swapped for another 12 bytes', async () => {
  const ctx = await setupTest();

  const file = buildFileWithHeader(ctx.sealed, {
    ...parseSealedHeader(ctx.sealed),
    iv: encodeBase64URL(new Uint8Array(12).fill(7)),
  });

  const opened = await openSpoolFile(file, ctx.pair.privateKey);

  expect(opened).toBeNull();
});

test('it opens to null for a version of 2', async () => {
  const ctx = await setupTest();

  const file = buildFileWithHeader(ctx.sealed, { ...parseSealedHeader(ctx.sealed), version: 2 });

  const opened = await openSpoolFile(file, ctx.pair.privateKey);

  expect(opened).toBeNull();
});

test('it opens to null for a header length past the end of the file', async () => {
  const ctx = await setupTest();

  const file = Uint8Array.from(ctx.sealed);

  new DataView(file.buffer).setUint32(0, file.length);

  const opened = await openSpoolFile(file, ctx.pair.privateKey);

  expect(opened).toBeNull();
});

test('it opens to null for a header length over 64 KiB', async () => {
  const ctx = await setupTest();

  const file = new Uint8Array(64 * 1024 + 4 + 64);

  new DataView(file.buffer).setUint32(0, 64 * 1024 + 1);

  const opened = await openSpoolFile(file, ctx.pair.privateKey);

  expect(opened).toBeNull();
});

test('it opens to null for a file under 4 bytes', async () => {
  const ctx = await setupTest();
  const opened = await openSpoolFile(new Uint8Array(3), ctx.pair.privateKey);

  expect(opened).toBeNull();
});

test('it opens to null when the ciphertext is under 16 bytes', async () => {
  const ctx = await setupTest();

  const length = new DataView(ctx.sealed.buffer).getUint32(0);

  const cut = ctx.sealed.subarray(0, 4 + length + 15);

  const opened = await openSpoolFile(cut, ctx.pair.privateKey);

  expect(opened).toBeNull();
});

test('it opens to null for a header that is not JSON', async () => {
  const ctx = await setupTest();

  const file = new Uint8Array(4 + 20 + 16);

  new DataView(file.buffer).setUint32(0, 20);

  file.set(new TextEncoder().encode('not json at all....'), 4);

  const opened = await openSpoolFile(file, ctx.pair.privateKey);

  expect(opened).toBeNull();
});

test('it opens to null with the key of another seed', async () => {
  const ctx = await setupTest();
  const other = await deriveSeededKeyPair('another invented seed');
  const opened = await openSpoolFile(ctx.sealed, other.privateKey);

  expect(opened).toBeNull();
});

test('it opens to null for a key that cannot derive bits', async () => {
  const ctx = await setupTest();

  const signing = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);

  const opened = await openSpoolFile(ctx.sealed, signing.privateKey);

  expect(opened).toBeNull();
});

test('it opens to null when the plain text is not as long as the header says', async () => {
  const captureID = '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3';

  const recipient = await createSpoolRecipient();

  const file = await sealSpoolBody(
    { captureID, sealTo: recipient.sealTo },
    {
      version: 1,
      captureID,
      writer: 'ab',
      counter: 1,
      receivedAt: 1,
      route: 'harbour',
      api: 'anthropic-messages',
      endpoint: 'messages',
      bytes: 99,
    },
    new Uint8Array(5),
  );

  const opened = await openSpoolFile(file, recipient.privateKey);

  expect(opened).toBeNull();
});
