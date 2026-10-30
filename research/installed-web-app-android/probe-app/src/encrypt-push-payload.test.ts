import { expect, test } from 'bun:test';
import { encryptPushPayload } from './encrypt-push-payload.ts';
import { decryptPushPayload } from './test-utils/decrypt-push-payload.ts';

test('it encrypts the RFC 8291 test vector to the body the RFC gives', async () => {
  const senderPublic = Buffer.from(
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    'base64url',
  );
  const senderKeyPair: CryptoKeyPair = {
    publicKey: await crypto.subtle.importKey(
      'raw',
      senderPublic,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    ),
    privateKey: await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
        x: senderPublic.subarray(1, 33).toString('base64url'),
        y: senderPublic.subarray(33, 65).toString('base64url'),
      },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    ),
  };

  const body = await encryptPushPayload({
    plaintext: Buffer.from('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24', 'base64url'),
    userAgentPublicKey: Buffer.from(
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      'base64url',
    ),
    authSecret: Buffer.from('BTBZMqHH6r4Tts7J_aSIgg', 'base64url'),
    senderKeyPair,
    salt: Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url'),
  });

  expect(Buffer.from(body).toString('base64url')).toBe(
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  );
});

test('it encrypts with a fresh key and salt that the subscriber decrypts', async () => {
  const userAgentKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const authSecret = new Uint8Array(16).fill(7);
  const userAgentPublicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', userAgentKeyPair.publicKey),
  );

  const first = await encryptPushPayload({
    plaintext: new TextEncoder().encode('{"title":"hello"}'),
    userAgentPublicKey,
    authSecret,
  });
  const second = await encryptPushPayload({
    plaintext: new TextEncoder().encode('{"title":"hello"}'),
    userAgentPublicKey,
    authSecret,
  });

  expect(first).not.toStrictEqual(second);
  expect(
    new TextDecoder().decode(
      await decryptPushPayload({ body: first, userAgentKeyPair, authSecret }),
    ),
  ).toBe('{"title":"hello"}');
});
