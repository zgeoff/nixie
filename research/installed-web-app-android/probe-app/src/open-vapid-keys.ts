import { link, mkdir, rm, writeFile } from 'node:fs/promises';
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

  if (!(await Bun.file(path).exists())) {
    await writeNewKeys(directory, path);
  }

  const stored = storedKeysSchema.parse(await Bun.file(path).json());

  return {
    privateKey: await crypto.subtle.importKey(
      'jwk',
      stored.privateJWK,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    ),
    publicKey: stored.publicKey,
  };
}

// Each starter writes a whole file under its own name, then links it into place. The link fails
// when the key file exists, so 2 first starts keep one pair, and a reader never sees half a file.
async function writeNewKeys(directory: string, path: string): Promise<void> {
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
  const draft = join(directory, `keys.${crypto.randomUUID()}.draft`);

  await mkdir(directory, { recursive: true, mode: 0o700 });
  // the private key stays readable only by the user who runs the server
  await writeFile(draft, JSON.stringify({ privateJWK, publicKey }), { mode: 0o600 });
  await link(draft, path).catch((error: unknown) => {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
      throw error;
    }
  });
  await rm(draft, { force: true });
}
