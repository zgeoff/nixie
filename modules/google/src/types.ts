import type { Connector, OAuthSpec, SetupStep } from '@heynixie/connections';
import type { GmailDeps } from './gmail/types';

// What the Calendar and Drive tools need of the server: the Google hosts, the live connections, the
// log that holds each action, the clock, and the limits of a text part and an image.
export type GoogleDeps = Pick<
  GmailDeps,
  'toolkit' | 'hosts' | 'access' | 'log' | 'clock' | 'textBytes' | 'imageLongEdge'
>;

// Where Google takes each kind of request. A test points every URL at a fake site.
export interface GoogleHosts {
  readonly authorizeURL: string;
  readonly tokenURL: string;
  readonly revokeURL: string;
  readonly issuer: string;
  readonly gmailOrigin: string;
  readonly apisOrigin: string;
}

// What an adapter gives the Google feature: where Google takes each request, how nixie asks for an
// account's consent, the setup steps the web client shows, and the check of an account's scopes.
export interface GoogleProvider {
  readonly hosts: GoogleHosts;
  readonly auth: OAuthSpec;
  readonly setup: readonly SetupStep[];
  readonly check: Connector['check'];
}
