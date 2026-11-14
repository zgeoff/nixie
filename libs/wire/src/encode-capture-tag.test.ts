import { expect, test } from 'bun:test';
import { encodeCaptureTag } from './encode-capture-tag';
import { deriveSeededKeyPair } from './test-utils';

test('it joins the capture ID and the base64url of the key with a dot', async () => {
  const pair = await deriveSeededKeyPair('nixie capture tag test seed');

  const captureID = '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3';
  const segment = encodeCaptureTag({ captureID, sealTo: pair.publicKey });

  expect(segment).toBe(`${captureID}.${Buffer.from(pair.publicKey).toString('base64url')}`);
});
