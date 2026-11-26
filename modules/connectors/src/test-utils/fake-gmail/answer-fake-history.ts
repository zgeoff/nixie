import type { FakeGmail } from './create-fake-gmail';

export interface FakeHistoryState {
  // the newest history ID
  readonly counter: number;

  // a start ID below it is one that Gmail no longer keeps
  readonly floor: number;
}

// The answers of Gmail's profile and history.list: the profile's history ID, and each message added
// since a start ID, over pages. A start ID that Gmail no longer keeps answers 404, as Gmail does.
export function answerFakeHistory(
  kind: 'profile' | 'history',
  gmail: FakeGmail,
  state: FakeHistoryState,
  url: URL,
): Response {
  if (kind === 'profile') {
    return Response.json({ emailAddress: gmail.account, historyId: String(state.counter) });
  }

  const start = Number(url.searchParams.get('startHistoryId'));
  const limit = Number(url.searchParams.get('maxResults') ?? 100);
  const offset = Number(url.searchParams.get('pageToken') ?? 0);

  if (!Number.isFinite(start) || start < state.floor) {
    return new Response('{"error":{"code":404,"errors":[{"reason":"notFound"}]}}', { status: 404 });
  }

  const added = gmail.history.filter((entry) => entry.id > start);
  const page = added.slice(offset, offset + limit);
  const next = offset + limit < added.length ? String(offset + limit) : undefined;

  const records = page.flatMap((entry) => {
    const stored = gmail.messages.get(entry.messageID);

    return stored === undefined
      ? []
      : [
          {
            id: String(entry.id),
            messagesAdded: [
              { message: { id: stored.id, threadId: stored.threadID, labelIds: stored.labels } },
            ],
          },
        ];
  });

  return Response.json({
    ...(records.length === 0 ? {} : { history: records }),
    historyId: String(state.counter),
    ...(next === undefined ? {} : { nextPageToken: next }),
  });
}
