import type { ConnectionMailbox } from '@heynixie/triggers';

// The ID of the mail source that polls Gmail, and the source of each Gmail mailbox.
export const gmailSourceID = 'gmail';

export function buildGmailMailbox(connectionID: string): ConnectionMailbox {
  return { kind: 'connection', source: gmailSourceID, connectionID };
}
