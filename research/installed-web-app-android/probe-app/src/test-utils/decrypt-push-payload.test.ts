import { expect, test } from 'bun:test';
import { decryptPushPayload } from './decrypt-push-payload.ts';

test('it decrypts the RFC 8291 test vector to its plaintext', async () => {
  const userAgentPublic = Buffer.from(
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    'base64url',
  );
  const userAgentKeyPair: CryptoKeyPair = {
    publicKey: await crypto.subtle.importKey(
      'raw',
      userAgentPublic,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    ),
    privateKey: await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        d: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
        x: userAgentPublic.subarray(1, 33).toString('base64url'),
        y: userAgentPublic.subarray(33, 65).toString('base64url'),
      },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    ),
  };

  const plaintext = await decryptPushPayload({
    body: Buffer.from(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
      'base64url',
    ),
    userAgentKeyPair,
    authSecret: Buffer.from('BTBZMqHH6r4Tts7J_aSIgg', 'base64url'),
  });

  expect(new TextDecoder().decode(plaintext)).toBe('When I grow up, I want to be a watermelon');
});
