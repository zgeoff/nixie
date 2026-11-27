import type { ConnectorContext } from '@heynixie/connections';
import { z } from 'zod';
import type { GoogleHosts } from '../../connector/google-hosts';
import { callGmail } from '../call-gmail';
import { GmailPollError } from './gmail-poll-error';
import { readOk } from './read-ok';

const profileSchema = z.object({ historyId: z.string() });

// The history ID that Gmail holds for the account now.
export async function readGmailProfileHistoryID(
  hosts: GoogleHosts,
  context: ConnectorContext,
): Promise<string> {
  const reply = await callGmail(hosts, context, { path: '/profile' });

  const parsed = profileSchema.safeParse(readOk(reply));

  if (!parsed.success) {
    throw new GmailPollError('Gmail answered with no history ID');
  }

  return parsed.data.historyId;
}
