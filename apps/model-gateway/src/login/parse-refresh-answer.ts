import { isRecord } from '../utils/is-record';

export type RefreshAnswer =
  | {
      readonly kind: 'token';
      readonly accessToken: string;

      // null when the answer rotated none, so the stored refresh token stays
      readonly refreshToken: string | null;
    }
  | { readonly kind: 'refused'; readonly code: string }
  | { readonly kind: 'service_error' }
  | { readonly kind: 'no_answer' };

const refusalCodes: ReadonlySet<string> = new Set([
  'refresh_token_expired',
  'refresh_token_reused',
  'refresh_token_invalidated',
  'invalid_grant',
]);

// A 4xx whose code is no refusal code, a 429, and a 200 with no access token all count as a service
// error, because only a refusal says the stored refresh token is dead.
export function parseRefreshAnswer(status: number, body: unknown): RefreshAnswer {
  if (status >= 200 && status < 300) {
    const accessToken = isRecord(body) ? body['access_token'] : undefined;
    const refreshToken = isRecord(body) ? body['refresh_token'] : undefined;

    return typeof accessToken === 'string' && accessToken !== ''
      ? {
          kind: 'token',
          accessToken,
          refreshToken:
            typeof refreshToken === 'string' && refreshToken !== '' ? refreshToken : null,
        }
      : { kind: 'service_error' };
  }

  const code = findErrorCode(body);

  return status >= 400 && status < 500 && status !== 429 && code !== null && refusalCodes.has(code)
    ? { kind: 'refused', code }
    : { kind: 'service_error' };
}

// the body's error when it is a string, else the code of an error object
function findErrorCode(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  const error = body['error'];

  if (typeof error === 'string') {
    return error;
  }

  return isRecord(error) && typeof error['code'] === 'string' ? error['code'] : null;
}
