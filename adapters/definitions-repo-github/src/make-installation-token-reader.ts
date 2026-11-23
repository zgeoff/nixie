import { createPrivateKey, sign } from 'node:crypto';
import { z } from 'zod';
import { formatGitHubMessage } from './format-github-message';

export interface InstallationTokenOptions {
  readonly apiURL: string;
  readonly clientID: string;
  readonly installationID: number;
  readonly privateKey: string;
  readonly readNowMs: () => number;
}

interface CachedToken {
  readonly token: string;
  readonly renewAtMs: number;
}

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

async function mintInstallationToken(options: InstallationTokenOptions): Promise<CachedToken> {
  const jwt = signAppJWT(options);

  const response = await fetch(
    `${options.apiURL}/app/installations/${options.installationID}/access_tokens`,
    {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${jwt}`,
        'user-agent': 'nixie',
        'x-github-api-version': '2022-11-28',
      },
    },
  );

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = formatGitHubMessage(body, [jwt, options.privateKey]);

    throw new Error(
      `GitHub refused to mint an installation token for the export with ${response.status}: ${detail}`,
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
  const signature = signWithRSAKey(signingInput, options.privateKey);

  return `${signingInput}.${signature.toString('base64url')}`;
}

function toBase64URL(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signWithRSAKey(signingInput: string, privateKey: string): Buffer {
  try {
    const key = createPrivateKey(privateKey);

    if (key.asymmetricKeyType === 'rsa') {
      return sign('RSA-SHA256', Buffer.from(signingInput), key);
    }
  } catch {
    // falls through to the one error below, which must not carry the parser's text
  }

  throw new Error('definitions_export_app_key is not a usable RSA private key in PEM form');
}
