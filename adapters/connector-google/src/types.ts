import type { GmailDeps } from './gmail/types';

// What the Calendar and Drive tools need of the server: the Google hosts, the live connections, the
// log that holds each action, the clock, and the limits of a text part and an image.
export type GoogleDeps = Pick<
  GmailDeps,
  'toolkit' | 'hosts' | 'access' | 'log' | 'clock' | 'textBytes' | 'imageLongEdge'
>;
