import type { GmailConnection } from './types';

// Whether the poll reads a connection: one that waits for a new consent is skipped until it has one.
export function isGmailPolled(connection: GmailConnection): boolean {
  return connection.status !== 'needs_consent';
}
