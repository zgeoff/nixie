import { expect, test } from 'bun:test';
import { buildVapidAuthorization } from './build-vapid-authorization.ts';

test('it signs a token for the push service origin that the public key verifies', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString(
    'base64url',
  );

  const authorization = await buildVapidAuthorization(
    'https://fcm.googleapis.com/fcm/send/abc123',
    { privateKey: pair.privateKey, publicKey },
    Date.UTC(2026, 0, 2, 3, 4, 5),
  );

  const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(authorization);

  if (match === null) {
    throw new Error(`unexpected header: ${authorization}`);
  }

  expect(match[4]).toBe(publicKey);
  expect(JSON.parse(Buffer.from(match[1] ?? '', 'base64url').toString())).toStrictEqual({
    typ: 'JWT',
    alg: 'ES256',
  });
  expect(JSON.parse(Buffer.from(match[2] ?? '', 'base64url').toString())).toStrictEqual({
    aud: 'https://fcm.googleapis.com',
    exp: Date.UTC(2026, 0, 2, 15, 4, 5) / 1000,
    sub: 'mailto:probe@example.com',
  });
  expect(
    await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      Buffer.from(match[3] ?? '', 'base64url'),
      new TextEncoder().encode(`${match[1]}.${match[2]}`),
    ),
  ).toBe(true);
});
