import { z } from 'zod';
import type { ConnectorContext } from '../../../types';
import type { GoogleHosts } from '../../google-hosts';
import { callGmail } from '../call-gmail';
import { GmailPollError } from './gmail-poll-error';
import { readOk } from './read-ok';

const pageSize = '500';
const addedSchema = z.object({ message: z.object({ id: z.string() }) });
const recordSchema = z.object({ messagesAdded: z.array(addedSchema).optional() });

const historySchema = z.object({
  history: z.array(recordSchema).optional(),
  historyId: z.string().optional(),
  nextPageToken: z.string().optional(),
});

export type GmailAddedIDs =
  | {
      readonly kind: 'added';
      readonly ids: readonly string[];

      // the history ID of the last page
      readonly historyID: string;
    }

  // the start ID is older than Gmail keeps
  | { readonly kind: 'expired' };

// The IDs of the messages added since a history ID, over every page. Gmail answers 404 for a start
// ID that it no longer keeps.
export async function readGmailAddedIDs(
  hosts: GoogleHosts,
  context: ConnectorContext,
  startHistoryID: string,
): Promise<GmailAddedIDs> {
  const ids = new Set<string>();

  let historyID = startHistoryID;
  let pageToken: string | null = null;

  do {
    const reply = await callGmail(hosts, context, {
      path: '/history',
      query: {
        startHistoryId: startHistoryID,
        historyTypes: 'messageAdded',
        maxResults: pageSize,
        ...(pageToken === null ? {} : { pageToken }),
      },
    });

    if (reply.kind === 'error' && reply.status === 404) {
      return { kind: 'expired' };
    }

    const page = historySchema.safeParse(readOk(reply));

    if (!page.success) {
      throw new GmailPollError('Gmail answered a history page that nixie cannot read');
    }

    for (const record of page.data.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        ids.add(added.message.id);
      }
    }

    historyID = page.data.historyId ?? historyID;
    pageToken = page.data.nextPageToken ?? null;
  } while (pageToken !== null);

  return { kind: 'added', ids: [...ids], historyID };
}
