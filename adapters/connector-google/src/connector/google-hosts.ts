// Where Google takes each kind of request. A test points every URL at a fake site.
export interface GoogleHosts {
  readonly authorizeURL: string;
  readonly tokenURL: string;
  readonly revokeURL: string;
  readonly issuer: string;
  readonly gmailOrigin: string;
  readonly apisOrigin: string;
}

export const googleHosts: GoogleHosts = {
  authorizeURL: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenURL: 'https://oauth2.googleapis.com/token',
  revokeURL: 'https://oauth2.googleapis.com/revoke',
  issuer: 'https://accounts.google.com',
  gmailOrigin: 'https://gmail.googleapis.com',
  apisOrigin: 'https://www.googleapis.com',
};
