import type { GoogleHosts } from '@heynixie/google';

export const googleHosts: GoogleHosts = {
  authorizeURL: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenURL: 'https://oauth2.googleapis.com/token',
  revokeURL: 'https://oauth2.googleapis.com/revoke',
  issuer: 'https://accounts.google.com',
  gmailOrigin: 'https://gmail.googleapis.com',
  apisOrigin: 'https://www.googleapis.com',
};
