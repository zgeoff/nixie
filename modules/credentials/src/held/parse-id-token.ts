import { z } from 'zod';
import type { TokenRequestErrorCode } from './token-request-error';

export interface IDTokenExpectation {
  readonly issuer: string;
  readonly audience: string;
  readonly nowMs: number;
}

export type ParsedIDToken =
  | {
      readonly isValid: true;
      readonly subject: string;
      readonly email: string | null;
    }
  | { readonly isValid: false; readonly code: TokenRequestErrorCode };

const audienceSchema = z.union([z.string(), z.array(z.string())]);

const checkedClaimsSchema = z.object({
  iss: z.string(),
  aud: audienceSchema,
  exp: z.number(),
});

const accountClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().exactOptional(),
});

// Reads an ID token that came straight from the provider's token endpoint over a checked
// connection. It checks the issuer, the audience and the expiry first, and reads `sub` and `email`
// only when all three pass. It never checks the signature: the token did not pass through a client.
export function parseIDToken(idToken: string, expected: IDTokenExpectation): ParsedIDToken {
  const payload = parsePayload(idToken);
  const checked = checkedClaimsSchema.safeParse(payload);

  if (!checked.success) {
    return { isValid: false, code: 'id_token_malformed' };
  }

  if (checked.data.iss !== expected.issuer) {
    return { isValid: false, code: 'id_token_issuer' };
  }

  const audiences = [checked.data.aud].flat();

  if (!audiences.includes(expected.audience)) {
    return { isValid: false, code: 'id_token_audience' };
  }

  if (checked.data.exp * 1000 <= expected.nowMs) {
    return { isValid: false, code: 'id_token_expired' };
  }

  const account = accountClaimsSchema.safeParse(payload);

  if (!account.success) {
    return { isValid: false, code: 'id_token_malformed' };
  }

  return {
    isValid: true,
    subject: account.data.sub,
    email: account.data.email ?? null,
  };
}

function parsePayload(idToken: string): unknown {
  const [, part] = idToken.split('.');

  if (part === undefined) {
    return null;
  }

  try {
    const text = Buffer.from(part, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(text);

    return parsed;
  } catch {
    return null;
  }
}
