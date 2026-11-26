import { z } from 'zod';
import type { ConnectorContext } from '../../../types';
import type { GoogleHosts } from '../../google-hosts';
import { callGmail } from '../call-gmail';
import { GmailPollError } from './gmail-poll-error';
import { readOk } from './read-ok';

const messageSchema = z.object({ id: z.string() });

const listSchema = z.object({
  messages: z.array(messageSchema).optional(),
  nextPageToken: z.string().optional(),
});

const lookbackMs = 10 * 60_000;

// The IDs of the mail that Gmail holds from 10 minutes before the last good poll, outside Sent and
// Drafts, over every page. A resync reads these when Gmail no longer keeps the history.
export async function readGmailRecentIDs(
  hosts: GoogleHosts,
  context: ConnectorContext,
  polledAtMs: number,
): Promise<string[]> {
  const after = Math.floor((polledAtMs - lookbackMs) / 1000);
  const ids: string[] = [];
  let pageToken: string | null = null;

  do {
    const reply = await callGmail(hosts, context, {
      path: '/messages',
      search: `after:${String(after)} -in:sent -in:drafts`,
      query: { maxResults: '500', ...(pageToken === null ? {} : { pageToken }) },
    });

    const page = listSchema.safeParse(readOk(reply));

    if (!page.success) {
      throw new GmailPollError('Gmail answered a message list that nixie cannot read');
    }

    ids.push(...(page.data.messages ?? []).map((message) => message.id));

    pageToken = page.data.nextPageToken ?? null;
  } while (pageToken !== null);

  return ids;
}
