import { z } from 'zod';
import { answerFakeHistory } from './answer-fake-history';
import type { FakeHold } from './build-fake-hold';
import { buildFakeHold } from './build-fake-hold';
import { buildSeededMail } from './build-seeded-mail';
import type { FakePart } from './parse-fake-raw';
import { parseFakeRaw } from './parse-fake-raw';

export interface FakeMailSeed {
  readonly from: string;
  readonly to?: readonly string[];
  readonly cc?: readonly string[];
  readonly replyTo?: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly attachments?: readonly {
    readonly name: string;
    readonly type: string;
    readonly bytes: Uint8Array;
  }[];

  // INBOX and UNREAD when absent
  readonly labels?: readonly string[];
  readonly id?: string;
  readonly threadID?: string;
  readonly sentAtMs?: number;

  // the Message-ID header, without angle brackets; made from the ID when absent
  readonly messageID?: string;
}

export interface StoredMail {
  readonly id: string;
  readonly threadID: string;
  labels: string[];
  readonly internalDateMs: number;
  readonly headers: readonly (readonly [string, string])[];
  readonly root: FakePart;
}

// how the next send ends: it goes out, it fails and went out, or it fails and never went out
export type FakeSendOutcome = 'ok' | 'error_after_send' | 'error_before_send';

export interface FakeFailure {
  // the request line starts with this, such as `POST /messages/send`
  readonly line: string;
  readonly status: number;
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface FakeGmail {
  readonly account: string;
  readonly messages: Map<string, StoredMail>;
  readonly drafts: Map<string, StoredMail>;
  readonly sent: StoredMail[];
  readonly labels: Map<string, string>;

  // each request as `GET /messages?q=...`, in order
  readonly requests: string[];
  readonly sendOutcomes: FakeSendOutcome[];
  readonly failures: FakeFailure[];

  // each message the account added, as history.list reports it; the ID is the history ID
  readonly history: { readonly id: number; readonly messageID: string }[];

  // the most items that a page of a list or of history.list holds; a request may ask for fewer
  maxPage: number;

  // the requests that wait for a release
  readonly holds: FakeHold[];

  // stops the next request whose line starts with `line` before it answers
  readonly hold: (line: string) => FakeHold;

  // makes every history ID so far unreadable, so history.list answers 404 as Gmail does
  readonly expireHistory: () => void;
  readonly seed: (mail: FakeMailSeed) => { readonly id: string; readonly threadID: string };
  readonly serve: (request: Request) => Promise<Response | null>;
}

const prefix = '/gmail/v1/users/me';

// An in-memory Gmail account that answers the calls of the Gmail tools: search, read, labels,
// drafts and sends. It stores what a send wrote, so a test can read the MIME headers it carries.
export function createFakeGmail(account = 'me@example.test'): FakeGmail {
  const state = {
    counter: 0,
    labelCounter: 0,
    historyCounter: 1000,
    historyFloor: 0,
  };

  const gmail: FakeGmail = {
    account,
    messages: new Map(),
    drafts: new Map(),
    sent: [],
    labels: new Map(),
    requests: [],
    sendOutcomes: [],
    failures: [],
    history: [],
    maxPage: Number.POSITIVE_INFINITY,
    holds: [],
    hold: (line) => {
      const hold = buildFakeHold(line);

      gmail.holds.push(hold);

      return hold;
    },
    expireHistory: () => {
      state.historyFloor = state.historyCounter + 1;
    },
    seed: (mail) => {
      const stored = buildSeededMail(mail, () => nextID(state, 'm'));

      gmail.messages.set(stored.id, stored);

      addHistory(gmail, state, stored.id);

      return { id: stored.id, threadID: stored.threadID };
    },
    serve: async (request) => {
      const url = new URL(request.url);

      if (!url.pathname.startsWith(prefix)) {
        return null;
      }

      const path = url.pathname.slice(prefix.length);
      const line = `${request.method} ${path}${url.search}`;

      gmail.requests.push(line);

      const held = gmail.holds.find((entry) => line.startsWith(entry.line));

      if (held !== undefined) {
        gmail.holds.splice(gmail.holds.indexOf(held), 1);

        await held.arrive();
      }

      const failure = gmail.failures.find((entry) => line.startsWith(entry.line));

      if (failure !== undefined) {
        gmail.failures.splice(gmail.failures.indexOf(failure), 1);

        return new Response(failure.body ?? '{"error":{"errors":[{"reason":"backendError"}]}}', {
          status: failure.status,
          ...(failure.headers === undefined ? {} : { headers: failure.headers }),
        });
      }

      return answer(gmail, state, { request, url, path });
    },
  };

  return gmail;
}

interface Counters {
  counter: number;
  labelCounter: number;
  historyCounter: number;
  historyFloor: number;
}

function nextID(state: Counters, kind: string): string {
  state.counter += 1;

  return `${kind}${String(state.counter).padStart(4, '0')}`;
}

function addHistory(gmail: FakeGmail, state: Counters, messageID: string): void {
  state.historyCounter += 1;

  gmail.history.push({ id: state.historyCounter, messageID });
}

interface Call {
  readonly request: Request;
  readonly url: URL;
  readonly path: string;
}

async function answer(gmail: FakeGmail, state: Counters, call: Call): Promise<Response> {
  const request = call.request;
  const url = call.url;
  const path = call.path;
  const segments = path.split('/').filter((segment) => segment !== '');
  const [kind, id, action] = segments;

  if ((kind === 'profile' || kind === 'history') && request.method === 'GET') {
    return answerFakeHistory(
      kind,
      gmail,
      { counter: state.historyCounter, floor: state.historyFloor, maxPage: gmail.maxPage },
      url,
    );
  }

  if (kind === 'messages' && request.method === 'GET' && id === undefined) {
    return listMessages(gmail, url);
  }

  if (kind === 'messages' && id === 'send' && request.method === 'POST') {
    const sent = await readBody(request);

    return sendMessage(gmail, state, sent);
  }

  if (
    kind === 'messages' &&
    id !== undefined &&
    action === 'attachments' &&
    segments[3] !== undefined
  ) {
    return readAttachment(gmail, id, segments[3]);
  }

  if (kind === 'messages' && id !== undefined && request.method === 'GET') {
    const stored =
      gmail.messages.get(id) ?? [...gmail.drafts.values()].find((draft) => draft.id === id);

    return stored === undefined ? notFound() : Response.json(toMessage(stored, url));
  }

  if (kind === 'threads' && id !== undefined) {
    const body = await readBody(request);

    return answerThread(gmail, { id, action, method: request.method, body });
  }

  if (kind === 'labels') {
    const body = await readBody(request);

    return answerLabels(gmail, state, request.method, body);
  }

  if (kind === 'drafts') {
    const body = await readBody(request);

    return answerDrafts(gmail, state, { request, url, id, body });
  }

  return notFound();
}

function listMessages(gmail: FakeGmail, url: URL): Response {
  const query = url.searchParams.get('q') ?? '';
  const labelIDs = url.searchParams.getAll('labelIds');
  const includeSpamTrash = url.searchParams.get('includeSpamTrash') === 'true';
  const limit = Math.min(Number(url.searchParams.get('maxResults') ?? 100), gmail.maxPage);
  const offset = Number(url.searchParams.get('pageToken') ?? 0);

  const matching = [...gmail.messages.values()]
    .filter(
      (stored) =>
        includeSpamTrash || !stored.labels.some((label) => label === 'SPAM' || label === 'TRASH'),
    )
    .filter((stored) => labelIDs.every((label) => stored.labels.includes(label)))
    .filter((stored) => isMatchingQuery(stored, query))
    .toSorted((left, right) => right.internalDateMs - left.internalDateMs);

  const page = matching.slice(offset, offset + limit);
  const next = offset + limit < matching.length ? String(offset + limit) : undefined;

  return Response.json({
    ...(page.length === 0
      ? {}
      : { messages: page.map((stored) => ({ id: stored.id, threadId: stored.threadID })) }),
    ...(next === undefined ? {} : { nextPageToken: next }),
  });
}

function isMatchingQuery(stored: StoredMail, query: string): boolean {
  const text = `${getText(stored.root)} ${header(stored, 'subject')}`.toLowerCase();

  return query
    .split(/\s+/u)
    .filter((token) => token !== '')
    .every((token) => {
      const [key, ...rest] = token.split(':');
      const value = rest.join(':').toLowerCase();

      if (key === 'from') {
        return header(stored, 'from').toLowerCase().includes(value);
      }

      if (key === 'after') {
        return stored.internalDateMs >= Number(value) * 1000;
      }

      if (key === 'rfc822msgid') {
        return [header(stored, 'message-id'), header(stored, 'x-google-original-message-id')].some(
          (candidate) => candidate.replaceAll(/[<>]/gu, '').toLowerCase() === value,
        );
      }

      return rest.length > 0 ? true : text.includes(token.toLowerCase());
    });
}

function getText(part: FakePart): string {
  if (part.mimeType === 'text/plain' && part.filename === '') {
    return new TextDecoder().decode(part.bytes);
  }

  for (const child of part.parts) {
    const found = getText(child);

    if (found !== '') {
      return found;
    }
  }

  return '';
}

function header(stored: StoredMail, name: string): string {
  return stored.headers.find(([key]) => key.toLowerCase() === name)?.[1] ?? '';
}

const recordSchema = z.record(z.string(), z.unknown());

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.method === 'GET' || request.method === 'DELETE') {
    return {};
  }

  const text = await request.text();

  const parsed: unknown = text === '' ? {} : JSON.parse(text);

  return recordSchema.parse(parsed);
}

function sendMessage(gmail: FakeGmail, state: Counters, body: Record<string, unknown>): Response {
  const outcome = gmail.sendOutcomes.shift() ?? 'ok';

  if (outcome === 'error_before_send') {
    return new Response('{"error":{"errors":[{"reason":"backendError"}]}}', { status: 503 });
  }

  const id = nextID(state, 's');
  const threadID = typeof body['threadId'] === 'string' ? body['threadId'] : id;
  const stored = buildStoredMail(readText(body['raw']), id, threadID, ['SENT']);

  gmail.messages.set(id, stored);
  gmail.sent.push(stored);

  addHistory(gmail, state, id);

  return outcome === 'error_after_send'
    ? new Response('{"error":{"errors":[{"reason":"backendError"}]}}', { status: 503 })
    : Response.json({ id, threadId: threadID, labelIds: ['SENT'] });
}

function buildStoredMail(raw: string, id: string, threadID: string, labels: string[]): StoredMail {
  const parsed = parseFakeRaw(raw);

  return {
    id,
    threadID,
    labels,
    internalDateMs: Date.now(),
    headers: parsed.headers,
    root: parsed.root,
  };
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readAttachment(gmail: FakeGmail, messageID: string, attachmentID: string): Response {
  const stored = gmail.messages.get(messageID) ?? gmail.drafts.get(messageID);
  const found = stored === undefined ? undefined : findAttachment(stored.root, attachmentID);

  return found === undefined
    ? notFound()
    : Response.json({
        size: found.bytes.byteLength,
        data: Buffer.from(found.bytes).toString('base64url'),
      });
}

function findAttachment(part: FakePart, attachmentID: string): FakePart | undefined {
  if (`att-${part.partID}` === attachmentID && isKeptApart(part)) {
    return part;
  }

  for (const child of part.parts) {
    const found = findAttachment(child, attachmentID);

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

// Gmail answers a file, and a body past this many bytes, by attachment ID.
const inlineBodyBytes = 50_000;

function isKeptApart(part: FakePart): boolean {
  return part.filename !== '' || part.bytes.byteLength > inlineBodyBytes;
}

function notFound(): Response {
  return new Response('{"error":{"code":404,"errors":[{"reason":"notFound"}]}}', { status: 404 });
}

function toMessage(stored: StoredMail, url: URL): Record<string, unknown> {
  const format = url.searchParams.get('format') ?? 'full';
  const text = getText(stored.root);

  if (format === 'raw') {
    return { id: stored.id, threadId: stored.threadID, raw: buildRaw(stored) };
  }

  const wanted = new Set(
    url.searchParams.getAll('metadataHeaders').map((name) => name.toLowerCase()),
  );

  return {
    id: stored.id,
    threadId: stored.threadID,
    labelIds: stored.labels,
    snippet: text.slice(0, 80),
    internalDate: String(stored.internalDateMs),
    payload:
      format === 'metadata'
        ? {
            mimeType: stored.root.mimeType,
            headers: stored.headers
              .filter(([name]) => wanted.has(name.toLowerCase()))
              .map(([name, value]) => ({ name, value })),
          }
        : toPayload(stored, stored.root),
  };
}

function buildRaw(stored: StoredMail): string {
  const head = stored.headers
    .filter(([name]) => !name.toLowerCase().startsWith('content-'))
    .map(([name, value]) => `${name}: ${value}`)
    .join('\r\n');

  const body = new TextDecoder().decode(stored.root.bytes);

  return Buffer.from(`${head}\r\nContent-Type: ${stored.root.mimeType}\r\n\r\n${body}`).toString(
    'base64url',
  );
}

function toPayload(stored: StoredMail, part: FakePart): Record<string, unknown> {
  const isRoot = part.partID === '' || part === stored.root;
  const isFile = isKeptApart(part);

  return {
    partId: part.partID,
    mimeType: part.mimeType,
    filename: part.filename,
    headers: [
      ...(isRoot ? stored.headers : []),
      ...part.headers.map(([name, value]) => ({ name, value })),
    ].map((entry) => ('name' in entry ? entry : { name: entry[0], value: entry[1] })),
    body: isFile
      ? { attachmentId: `att-${part.partID}`, size: part.bytes.byteLength }
      : {
          size: part.bytes.byteLength,
          ...(part.bytes.byteLength === 0
            ? {}
            : { data: Buffer.from(part.bytes).toString('base64url') }),
        },
    ...(part.parts.length === 0
      ? {}
      : { parts: part.parts.map((child) => toPayload(stored, child)) }),
  };
}

interface ThreadCall {
  readonly id: string;
  readonly action: string | undefined;
  readonly method: string;
  readonly body: Record<string, unknown>;
}

function answerThread(gmail: FakeGmail, call: ThreadCall): Response {
  const members = [...gmail.messages.values()].filter((stored) => stored.threadID === call.id);

  if (members.length === 0) {
    return notFound();
  }

  if (call.action === 'modify') {
    const add = asStrings(call.body['addLabelIds']);
    const remove = asStrings(call.body['removeLabelIds']);

    for (const stored of members) {
      stored.labels = [...new Set([...stored.labels, ...add])].filter(
        (label) => !remove.includes(label),
      );
    }

    return Response.json({ id: call.id });
  }

  return Response.json({
    id: call.id,
    messages: members.map((stored) => ({ id: stored.id, labelIds: stored.labels })),
  });
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

const systemLabels = ['INBOX', 'UNREAD', 'STARRED', 'IMPORTANT', 'SENT', 'SPAM', 'TRASH', 'DRAFT'];

function answerLabels(
  gmail: FakeGmail,
  state: Counters,
  method: string,
  body: Record<string, unknown>,
): Response {
  if (method === 'POST') {
    const name = readText(body['name']);

    if (gmail.labels.has(name)) {
      return new Response('{"error":{"errors":[{"reason":"duplicate"}]}}', { status: 409 });
    }

    state.labelCounter += 1;

    const id = `Label_${String(state.labelCounter)}`;

    gmail.labels.set(name, id);

    return Response.json({ id, name });
  }

  return Response.json({
    labels: [
      ...systemLabels.map((name) => ({ id: name, name, type: 'system' })),
      ...[...gmail.labels].map(([name, id]) => ({ id, name, type: 'user' })),
    ],
  });
}

interface DraftCall {
  readonly request: Request;
  readonly url: URL;
  readonly id: string | undefined;
  readonly body: Record<string, unknown>;
}

function answerDrafts(gmail: FakeGmail, state: Counters, call: DraftCall): Response {
  if (call.request.method === 'POST' && call.id === undefined) {
    const message = call.body['message'];

    const raw =
      typeof message === 'object' && message !== null && 'raw' in message
        ? String(message.raw)
        : '';

    const id = `r-${nextID(state, 'd')}`;
    const stored = buildStoredMail(raw, `${id}-m`, `${id}-t`, ['DRAFT']);

    gmail.drafts.set(id, stored);

    return Response.json({ id, message: { id: stored.id, threadId: stored.threadID } });
  }

  if (call.request.method === 'GET' && call.id === undefined) {
    const query = call.url.searchParams.get('q') ?? '';

    return Response.json({
      drafts: [...gmail.drafts]
        .filter(([, stored]) => isMatchingQuery(stored, query))
        .map(([id, stored]) => ({ id, message: { id: stored.id } })),
    });
  }

  const stored = call.id === undefined ? undefined : gmail.drafts.get(call.id);

  if (call.id === undefined || stored === undefined) {
    return notFound();
  }

  if (call.request.method === 'DELETE') {
    gmail.drafts.delete(call.id);

    return new Response(null, { status: 204 });
  }

  return Response.json({ id: call.id, message: toMessage(stored, call.url) });
}
