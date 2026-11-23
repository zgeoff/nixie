import { sign } from 'node:crypto';
import { z } from 'zod';

export interface InstallationTokenOptions {
  readonly apiURL: string;
  readonly clientID: string;
  readonly installationID: number;

  // the App's private key as a PEM
  readonly privateKey: string;
  readonly readNowMs: () => number;
}

interface CachedToken {
  readonly token: string;
  readonly renewAtMs: number;
}

// Trades a signed App JWT for an installation token, keeps the token and mints a new one from 5 min
// before it expires. An error quotes GitHub's status and message, never the key, the JWT or a token.
export function makeInstallationTokenReader(
  options: InstallationTokenOptions,
): () => Promise<string> {
  let cached: CachedToken | null = null;
  let minting: Promise<CachedToken> | null = null;

  return async () => {
    if (cached !== null && options.readNowMs() < cached.renewAtMs) {
      return cached.token;
    }

    minting ??= mintInstallationToken(options);

    try {
      cached = await minting;
    } finally {
      minting = null;
    }

    return cached.token;
  };
}

const renewMarginMs = 5 * 60_000;
const mintResponseSchema = z.object({ token: z.string().min(1), expires_at: z.iso.datetime() });
const errorResponseSchema = z.object({ message: z.string() });

async function mintInstallationToken(options: InstallationTokenOptions): Promise<CachedToken> {
  const response = await fetch(
    `${options.apiURL}/app/installations/${options.installationID}/access_tokens`,
    {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${signAppJWT(options)}`,
        'user-agent': 'nixie',
        'x-github-api-version': '2022-11-28',
      },
    },
  );

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = errorResponseSchema.safeParse(body);

    throw new Error(
      `GitHub refused to mint an installation token for the export with ${response.status}: ${
        detail.success ? detail.data.message : 'no message'
      }`,
    );
  }

  const minted = mintResponseSchema.safeParse(body);

  if (!minted.success) {
    throw new Error('GitHub answered the installation token request with an unreadable body');
  }

  return {
    token: minted.data.token,
    renewAtMs: Date.parse(minted.data.expires_at) - renewMarginMs,
  };
}

const jwtBackdateMs = 60_000;
const jwtLifeMs = 9 * 60_000;

function signAppJWT(options: InstallationTokenOptions): string {
  const nowMs = options.readNowMs();
  const header = toBase64URL({ alg: 'RS256', typ: 'JWT' });

  const claims = toBase64URL({
    iss: options.clientID,
    iat: Math.floor((nowMs - jwtBackdateMs) / 1000),
    exp: Math.floor((nowMs + jwtLifeMs) / 1000),
  });

  const signingInput = `${header}.${claims}`;

  try {
    const signature = sign('RSA-SHA256', Buffer.from(signingInput), options.privateKey);

    return `${signingInput}.${signature.toString('base64url')}`;
  } catch {
    throw new Error('definitions_export_app_key is not a usable RSA private key in PEM form');
  }
}

function toBase64URL(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
