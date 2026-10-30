import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { VapidKeys } from './build-vapid-authorization.ts';

const storedKeysSchema = z.object({
  privateJWK: z.object({
    kty: z.literal('EC'),
    crv: z.literal('P-256'),
    x: z.string(),
    y: z.string(),
    d: z.string(),
  }),
  publicKey: z.string(),
});

// Reads the key pair from the folder, or generates one and writes it there on the first start. A
// stable key keeps a phone's subscription valid across restarts of the server.
export async function openVapidKeys(directory: string): Promise<VapidKeys> {
  const path = join(directory, 'keys.json');
  const file = Bun.file(path);

  if (await file.exists()) {
    const stored = storedKeysSchema.parse(await file.json());

    return {
      privateKey: await importPrivateKey(stored.privateJWK),
      publicKey: stored.publicKey,
    };
  }

  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const privateJWK = storedKeysSchema.shape.privateJWK.parse(
    await crypto.subtle.exportKey('jwk', pair.privateKey),
  );
  const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString(
    'base64url',
  );

  await mkdir(directory, { recursive: true, mode: 0o700 });
  // the private key stays readable only by the user who runs the server
  await writeFile(path, JSON.stringify({ privateJWK, publicKey }), { mode: 0o600 });

  return { privateKey: await importPrivateKey(privateJWK), publicKey };
}

function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
}
