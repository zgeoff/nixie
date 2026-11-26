import type { ActionAttempt, CheckResponse, ConnectorContext } from '../../types';
import { buildItemID } from './build-item-id';
import { buildSendMessageID } from './build-send-message-id';
import { callGmail } from './call-gmail';
import { listMessagesSchema } from './list-messages-schema';
import { readCallContext } from './read-call-context';
import { readGmailMessage } from './read-gmail-message';
import { stripAngleBrackets } from './strip-angle-brackets';
import type { GmailDeps, GmailMessage } from './types';
import { writeGmailReplyRule } from './write-gmail-reply-rule';

const listWindowMs = 10 * 60 * 1000;

// The read-only check of a send of unknown outcome: asks Gmail 2 ways whether a message holds the
// action's Message-ID. Found wins over everything. Not found needs both ways to finish and find
// nothing, and any failure or an over-long list makes the answer inconclusive.
export async function checkGmailSent(
  deps: GmailDeps,
  attempt: ActionAttempt,
): Promise<CheckResponse> {
  const context = await readCallContext(deps.access, attempt.arguments);

  if (context === null) {
    return { kind: 'inconclusive' };
  }

  const messageID = buildSendMessageID(context.account, attempt.actionID);

  const bySearch = await lookBySearch(deps, context, messageID);

  const bySent =
    bySearch.kind === 'found'
      ? bySearch
      : await lookInSent(deps, context, {
          messageID,
          afterMs: (attempt.attemptStartedAt ?? 0) - listWindowMs,
        });

  const found = bySearch.kind === 'found' ? bySearch : bySent;

  if (found.kind === 'found') {
    const threadID = found.message.threadID;

    // A send of unknown outcome that the check finds gets its reply rule now, and the poll reads the
    // mail since the send again. A rule that cannot be written leaves the check inconclusive, so the
    // owner is asked rather than told the send had no rule.
    const replyRule = await writeGmailReplyRule(deps, context, { attempt, threadID }).catch(
      () => false as const,
    );

    if (replyRule === false) {
      return { kind: 'inconclusive' };
    }

    return {
      kind: 'found',
      result: {
        message: buildItemID(context.connection, found.message.id),
        thread: buildItemID(context.connection, threadID),
        replyRule,
      },
    };
  }

  return bySearch.kind === 'none' && bySent.kind === 'none'
    ? { kind: 'not_found' }
    : { kind: 'inconclusive' };
}

type Looked =
  | { readonly kind: 'found'; readonly message: GmailMessage }
  | { readonly kind: 'none' | 'failed' };

async function lookBySearch(
  deps: GmailDeps,
  context: ConnectorContext,
  messageID: string,
): Promise<Looked> {
  const listed = await callGmail(deps.hosts, context, {
    path: '/messages',
    search: `rfc822msgid:${messageID}`,
    query: { includeSpamTrash: 'true' },
  });

  if (listed.kind === 'error') {
    return { kind: 'failed' };
  }

  const ids = readIDs(listed.body);

  return ids === null ? { kind: 'failed' } : readHeaders(deps, context, { ids, messageID });
}

// A list that Gmail answered in a shape the check cannot read is null, which is no empty list.
function readIDs(body: unknown): string[] | null {
  const parsed = listMessagesSchema.safeParse(body);

  return parsed.success ? (parsed.data.messages ?? []).map((entry) => entry.id) : null;
}

interface HeaderRead {
  readonly ids: readonly string[];
  readonly messageID: string;
}

async function readHeaders(
  deps: GmailDeps,
  context: ConnectorContext,
  request: HeaderRead,
): Promise<Looked> {
  let isFailed = false;

  for (const id of request.ids) {
    const read = await readGmailMessage(deps.hosts, context, { id, format: 'metadata' });

    if (read.kind !== 'message') {
      isFailed = true;
    }

    if (read.kind === 'message' && hasMessageID(read.message, request.messageID)) {
      return { kind: 'found', message: read.message };
    }
  }

  return { kind: isFailed ? 'failed' : 'none' };
}

// Gmail can replace a Message-ID that a client set, and keep the old one in a header of its own.
function hasMessageID(message: GmailMessage, messageID: string): boolean {
  const headers = message.payload.headers;

  return ['message-id', 'x-google-original-message-id'].some(
    (name) => stripAngleBrackets(headers.get(name)) === messageID,
  );
}

interface SentWindow {
  readonly messageID: string;
  readonly afterMs: number;
}

// The most messages of the Sent label that the check reads. More means the window holds too many
// sends to tell, and the check answers inconclusive.
const maxListed = 200;
const pageSize = 100;

async function lookInSent(
  deps: GmailDeps,
  context: ConnectorContext,
  window: SentWindow,
): Promise<Looked> {
  const ids: string[] = [];
  const afterSeconds = Math.max(0, Math.floor(window.afterMs / 1000));
  let pageToken: string | undefined;

  do {
    const listed = await callGmail(deps.hosts, context, {
      path: '/messages',
      search: `after:${String(afterSeconds)}`,
      query: {
        labelIds: 'SENT',
        includeSpamTrash: 'true',
        maxResults: String(pageSize),
        ...(pageToken === undefined ? {} : { pageToken }),
      },
    });

    if (listed.kind === 'error') {
      return { kind: 'failed' };
    }

    const page = readIDs(listed.body);

    if (page === null) {
      return { kind: 'failed' };
    }

    ids.push(...page);

    pageToken = listMessagesSchema.safeParse(listed.body).data?.nextPageToken;
  } while (pageToken !== undefined && ids.length <= maxListed);

  if (ids.length > maxListed) {
    return { kind: 'failed' };
  }

  return readHeaders(deps, context, { ids, messageID: window.messageID });
}
