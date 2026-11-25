// Where Google takes token and revoke requests, and who its ID tokens name as the issuer.
export interface ProviderEndpoints {
  readonly tokenURL: string;
  readonly revokeURL: string;
  readonly issuer: string;

  // the origins a request to these URLs reaches
  readonly origins: readonly string[];
}

export const googleEndpoints: ProviderEndpoints = {
  tokenURL: 'https://oauth2.googleapis.com/token',
  revokeURL: 'https://oauth2.googleapis.com/revoke',
  issuer: 'https://accounts.google.com',
  origins: ['https://oauth2.googleapis.com'],
};
