export interface VapidKeys {
  privateKey: CryptoKey;
  // the uncompressed P-256 point, base64url, as the page passes it to subscribe()
  publicKey: string;
}

// RFC 8292: the push service refuses a token whose expiry lies more than 24 h ahead
const tokenLifetimeSeconds = 12 * 60 * 60;

export async function buildVapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  nowMs: number,
): Promise<string> {
  const header = toBase64URLJSON({ typ: 'JWT', alg: 'ES256' });
  const claims = toBase64URLJSON({
    aud: new URL(endpoint).origin,
    exp: Math.floor(nowMs / 1000) + tokenLifetimeSeconds,
    sub: 'mailto:probe@example.com',
  });
  const signingInput = `${header}.${claims}`;
  // WebCrypto returns the raw r || s form that JWS expects for ES256
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keys.privateKey,
    new TextEncoder().encode(signingInput),
  );

  return `vapid t=${signingInput}.${Buffer.from(signature).toString('base64url')}, k=${keys.publicKey}`;
}

function toBase64URLJSON(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
