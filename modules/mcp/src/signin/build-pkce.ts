import { createHash, randomBytes } from 'node:crypto';

export interface PKCE {
  readonly verifier: string;

  // the S256 challenge of the verifier
  readonly challenge: string;
}

// A fresh verifier of 43 characters, and the challenge that goes in the authorization request.
export function buildPKCE(): PKCE {
  const verifier = randomBytes(32).toString('base64url');

  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}
