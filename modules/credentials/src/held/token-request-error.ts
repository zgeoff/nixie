import { CredentialRefusalError } from '@heynixie/egress';

export type TokenRequestErrorCode =
  | 'refused'
  | 'service_error'
  | 'no_answer'
  | 'id_token_malformed'
  | 'id_token_issuer'
  | 'id_token_audience'
  | 'id_token_expired';

// A token exchange that gave no token, or whose ID token failed a check. The message never holds a
// value, and the code says which check failed.
export class TokenRequestError extends CredentialRefusalError {
  public readonly code: TokenRequestErrorCode;

  public constructor(code: TokenRequestErrorCode) {
    super(`the token request failed: ${code}`);

    this.name = 'TokenRequestError';
    this.code = code;
  }
}
