import { timingSafeEqual } from 'node:crypto';
import { ORPCError, implement } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { ResponseHeadersPlugin, type ResponseHeadersPluginContext } from '@orpc/server/plugins';
import { match } from 'ts-pattern';
import type { z } from 'zod';
import { buildPairingCode } from './build-pairing-code.ts';
import { buildPushDelivery } from './build-push-delivery.ts';
import type { VapidKeys } from './build-vapid-authorization.ts';
import {
  adminHeaderName,
  clientHeaderName,
  type LogEntry,
  probeContract,
  type pushInputSchema,
  rpcPrefix,
} from './contract.ts';
import { hashSecret } from './hash-secret.ts';
import { pickApprovalRefusal, type StoredApproval } from './pick-approval-refusal.ts';
import { type SendResult, pickSendOutcome } from './pick-send-outcome.ts';
import { pickStaticResponse } from './pick-static-response.ts';
import { type CappedBody, readCappedBody } from './read-capped-body.ts';
import { renderIconPNG } from './render-icon-png.ts';
import { type PushSubscriptionRecord, type PushTransport, sendPush } from './send-push.ts';
import { trimOldest } from './trim-oldest.ts';

interface ProbeHandlerOptions {
  vapidKeys: VapidKeys;
  adminKey: string;
  publicDirectory: string;
  // the bundled service worker and page scripts, by the path the browser asks for
  clientAssets: ReadonlyMap<string, Blob>;
  isPushEndpointAllowed: (endpoint: URL) => boolean;
  pushTransport: PushTransport;
  // runs a delayed push; the server passes a timer, and a test runs the task when it chooses
  schedule: (delayMs: number, task: () => Promise<void>) => void;
  // a file from the public folder, or null when it does not exist
  readPublicFile: (path: string) => Promise<Blob | null>;
  // a signal that aborts when a caller has had long enough to send one whole request body; the
  // server passes a timer, and a test aborts it when it chooses
  startBodyDeadline: () => AbortSignal;
  writeError: (message: string, error: unknown) => void;
  now: () => number;
}

interface ProbeContext extends ResponseHeadersPluginContext {
  sessionToken: string | null;
  isAdmin: boolean;
  cookieSent: boolean;
  secFetchSite: string | null;
  secFetchMode: string | null;
}

interface StoredSubscription extends PushSubscriptionRecord {
  sessionToken: string;
}

// Everything the server keeps for one paired phone lives with its session and has a bound of its
// own, so one session can never push out another's records.
interface Session {
  label: string;
  log: StoredLogEntry[];
  approvals: Map<string, StoredApproval>;
  // when the server sent each push to this session
  pushSentAt: Map<string, number>;
  // push IDs of the receipts the log holds
  receipts: Set<string>;
  syncedMessages: Set<string>;
}

// The order number lets the admin's log merge every session's entries in the order they came.
interface StoredLogEntry {
  order: number;
  entry: LogEntry;
}

interface Pairing {
  codeHash: Buffer;
  issuedAt: number;
  failures: number;
}

const sessionCookie = 'probe_session';
const approvalLifetimeMs = 15 * 60 * 1000;
const pairingLifetimeMs = 10 * 60 * 1000;
const pairingCodeLength = 10;
const sessionMaxAgeSeconds = 30 * 24 * 60 * 60;

// Anyone who reaches the public URL can call the server. Only the admin key makes a session, through
// a pairing code, and every request the server keeps from bounds both its count and its size.
export const probeLimits = {
  sessions: 20,
  pairingAttempts: 5,
  logEntriesPerSession: 500,
  // shares without a session and approve calls without one, which only the admin reads
  anonymousLogEntries: 100,
  subscriptionsPerSession: 5,
  approvalsPerSession: 200,
  pushesPerSession: 200,
  syncedMessagesPerSession: 1000,
  receiptsPerSession: 1000,
  // waiting or sending, for each session and for the admin
  pushesInProgress: 10,
  rpcBodyBytes: 64 * 1024,
  // a phone photo fits; the server keeps only each file's name, type and size
  shareBodyBytes: 25 * 1024 * 1024,
  // for shares with a session, and again for shares without one
  sharesInFlight: 2,
  shareFieldCharacters: 2000,
  shareFiles: 20,
  fileNameCharacters: 200,
  headerValueCharacters: 100,
};

export function makeProbeHandler(
  options: ProbeHandlerOptions,
): (request: Request) => Promise<Response> {
  // session cookie value → the session's records
  const sessions = new Map<string, Session>();
  const subscriptions = new Map<string, StoredSubscription>();
  const anonymousLog: StoredLogEntry[] = [];
  // the session cookie value, or 'admin', → pushes waiting or sending
  const pushesInProgress = new Map<string, number>();
  const sharesInFlight = { session: 0, anonymous: 0 };
  let pairing: Pairing | null = null;
  let nextLogOrder = 0;

  function writeLog(
    kind: LogEntry['kind'],
    sessionToken: string | null,
    detail: Record<string, unknown>,
  ): LogEntry {
    const session = sessionToken === null ? undefined : sessions.get(sessionToken);
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      at: new Date(options.now()).toISOString(),
      session: session?.label ?? null,
      kind,
      detail,
    };
    const bucket = session?.log ?? anonymousLog;

    bucket.push({ order: nextLogOrder, entry });
    nextLogOrder += 1;
    bucket.splice(
      0,
      Math.max(
        0,
        bucket.length -
          (session === undefined ? probeLimits.anonymousLogEntries : probeLimits.logEntriesPerSession),
      ),
    );

    return entry;
  }

  function findSession(request: Request): string | null {
    const token = new Bun.CookieMap(request.headers.get('cookie') ?? '').get(sessionCookie);

    return token !== null && sessions.has(token) ? token : null;
  }

  function removeSession(sessionToken: string): void {
    sessions.delete(sessionToken);

    for (const subscription of subscriptions.values()) {
      if (subscription.sessionToken === sessionToken) {
        subscriptions.delete(subscription.endpoint);
      }
    }
  }

  function changePushesInProgress(caller: string, change: 1 | -1): void {
    const count = (pushesInProgress.get(caller) ?? 0) + change;

    if (count === 0) {
      pushesInProgress.delete(caller);
    } else {
      pushesInProgress.set(caller, count);
    }
  }

  async function sendOne(
    subscription: StoredSubscription,
    push: z.infer<typeof pushInputSchema>,
    pushID: string,
  ): Promise<number> {
    const session = sessions.get(subscription.sessionToken);
    const sentAt = options.now();
    const delivery = buildPushDelivery({
      sessionKnown: session !== undefined,
      sessionToken: subscription.sessionToken,
      push,
      pushID,
      sentAt,
      approvalID: crypto.randomUUID(),
      approvalToken: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),
    });

    if (delivery.kind === 'skip' || session === undefined) {
      return 0;
    }

    if (delivery.approval !== null) {
      session.approvals.set(delivery.approval.approvalID, delivery.approval.stored);
      trimOldest(session.approvals, probeLimits.approvalsPerSession);
    }

    session.pushSentAt.set(pushID, sentAt);
    trimOldest(session.pushSentAt, probeLimits.pushesPerSession);

    const outcome = pickSendOutcome(
      await sendPush({
        subscription,
        payload: delivery.payload,
        urgency: push.urgency,
        vapidKeys: options.vapidKeys,
        nowMs: sentAt,
        transport: options.pushTransport,
      }).then(
        (status): SendResult => ({ kind: 'answered', status }),
        (error: unknown): SendResult => ({ kind: 'failed', error }),
      ),
    );

    if (outcome.failure !== null) {
      options.writeError('push send failed', outcome.failure.error);
    }

    if (outcome.removeSubscription) {
      subscriptions.delete(subscription.endpoint);
    }

    writeLog('push-sent', subscription.sessionToken, {
      pushID,
      pushService: new URL(subscription.endpoint).host,
      status: outcome.status,
      urgency: push.urgency,
      tag: push.tag,
      silent: push.silent,
      renotify: push.renotify,
      approvalID: delivery.approval?.approvalID ?? null,
    });

    return outcome.status;
  }

  const base = implement(probeContract).$context<ProbeContext>();

  function requireSession(context: ProbeContext): { token: string; session: Session } {
    const session = context.sessionToken === null ? undefined : sessions.get(context.sessionToken);

    if (context.sessionToken === null || session === undefined) {
      throw new ORPCError('UNAUTHORIZED', { message: 'no session' });
    }

    return { token: context.sessionToken, session };
  }

  function requireAdmin(context: ProbeContext): void {
    if (!context.isAdmin) {
      throw new ORPCError('UNAUTHORIZED', { message: 'needs the admin key' });
    }
  }

  const router = base.router({
    config: base.config.handler(({ context }) => ({
      vapidPublicKey: options.vapidKeys.publicKey,
      session:
        context.sessionToken === null ? null : (sessions.get(context.sessionToken)?.label ?? null),
    })),

    createPairing: base.createPairing.handler(({ context }) => {
      requireAdmin(context);

      const code = buildPairingCode(crypto.getRandomValues(new Uint8Array(pairingCodeLength)));
      const issuedAt = options.now();

      pairing = { codeHash: hashSecret(code), issuedAt, failures: 0 };

      return { code, expiresAt: new Date(issuedAt + pairingLifetimeMs).toISOString() };
    }),

    pair: base.pair.handler(({ context, input }) => {
      if (pairing === null || options.now() - pairing.issuedAt > pairingLifetimeMs) {
        pairing = null;

        throw new ORPCError('FORBIDDEN', { message: 'no pairing code waiting' });
      }

      const code = input.code.toLowerCase().replaceAll(/[^0-9a-z]/g, '');

      if (!timingSafeEqual(hashSecret(code), pairing.codeHash)) {
        pairing.failures += 1;

        if (pairing.failures >= probeLimits.pairingAttempts) {
          pairing = null;
        }

        throw new ORPCError('FORBIDDEN', { message: 'wrong pairing code' });
      }

      // pairing again replaces the phone's earlier session
      if (context.sessionToken !== null) {
        removeSession(context.sessionToken);
      }

      if (sessions.size >= probeLimits.sessions) {
        throw new ORPCError('CONFLICT', {
          message: 'too many paired sessions; sign one out or restart the server',
        });
      }

      pairing = null;

      const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
      const label = `S-${crypto.randomUUID().slice(0, 8)}`;

      sessions.set(token, {
        label,
        log: [],
        approvals: new Map(),
        pushSentAt: new Map(),
        receipts: new Set(),
        syncedMessages: new Set(),
      });
      context.resHeaders?.append(
        'set-cookie',
        `${sessionCookie}=${token}; Path=/; Max-Age=${sessionMaxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`,
      );

      return { session: label };
    }),

    subscribe: base.subscribe.handler(({ context, input }) => {
      const { token } = requireSession(context);

      if (!options.isPushEndpointAllowed(new URL(input.endpoint))) {
        throw new ORPCError('BAD_REQUEST', { message: 'unknown push service' });
      }

      const existing = subscriptions.get(input.endpoint);

      if (existing !== undefined && existing.sessionToken !== token) {
        throw new ORPCError('CONFLICT', { message: 'another session holds this endpoint' });
      }

      subscriptions.delete(input.endpoint);
      subscriptions.set(input.endpoint, {
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        sessionToken: token,
      });

      const own = [...subscriptions.values()].filter(
        (subscription) => subscription.sessionToken === token,
      );

      for (const oldest of own.slice(0, Math.max(0, own.length - probeLimits.subscriptionsPerSession))) {
        subscriptions.delete(oldest.endpoint);
      }

      writeLog('subscribed', token, { pushService: new URL(input.endpoint).host });

      return { subscribed: true as const };
    }),

    push: base.push.handler(async ({ context, input }) => {
      const caller = context.isAdmin ? 'admin' : requireSession(context).token;
      const targets = [...subscriptions.values()].filter(
        (subscription) => context.isAdmin || subscription.sessionToken === caller,
      );

      if (targets.length === 0) {
        throw new ORPCError('CONFLICT', { message: 'no subscription to send to' });
      }

      if ((pushesInProgress.get(caller) ?? 0) >= probeLimits.pushesInProgress) {
        throw new ORPCError('TOO_MANY_REQUESTS', { message: 'too many pushes in progress' });
      }

      const pushID = crypto.randomUUID();

      changePushesInProgress(caller, 1);

      const sendAll = () =>
        Promise.all(targets.map((subscription) => sendOne(subscription, input, pushID))).finally(
          () => changePushesInProgress(caller, -1),
        );

      if (input.delaySeconds > 0) {
        options.schedule(input.delaySeconds * 1000, async () => {
          await sendAll();
        });

        return { pushID, delaySeconds: input.delaySeconds, statuses: null };
      }

      return { pushID, delaySeconds: 0, statuses: await sendAll() };
    }),

    pushReceived: base.pushReceived.handler(({ context, input }) => {
      const { token, session } = requireSession(context);
      const sentAt = session.pushSentAt.get(input.pushID);

      if (sentAt === undefined) {
        throw new ORPCError('NOT_FOUND', { message: 'unknown push' });
      }

      // a report whose answer got lost comes again, and a page and the service worker can report
      // the same receipt at once; the log keeps one entry for each push a session received
      if (session.receipts.has(input.pushID)) {
        return { recorded: true as const, duplicate: true };
      }

      session.receipts.add(input.pushID);
      trimOldest(session.receipts, probeLimits.receiptsPerSession);
      writeLog('push-received', token, {
        pushID: input.pushID,
        phoneClockDelayMs: input.receivedAt - sentAt,
        reportedAfterMs: options.now() - sentAt,
      });

      return { recorded: true as const, duplicate: false };
    }),

    approve: base.approve.handler(({ context, input }) => {
      const approval = [...sessions.values()]
        .map((session) => session.approvals.get(input.approvalID))
        .find((candidate) => candidate !== undefined);
      const refusal = pickApprovalRefusal({
        sessionToken: context.sessionToken,
        approval,
        token: input.token,
        nowMs: options.now(),
        lifetimeMs: approvalLifetimeMs,
      });

      writeLog('approve', context.sessionToken, {
        cookieSent: context.cookieSent,
        sessionKnown: context.sessionToken !== null,
        secFetchSite: context.secFetchSite,
        secFetchMode: context.secFetchMode,
        approvalID: input.approvalID,
        outcome: refusal?.reason ?? 'approved',
      });

      if (refusal !== null || approval === undefined) {
        throw new ORPCError(refusal?.code ?? 'NOT_FOUND', {
          status: refusal?.status ?? 404,
          message: refusal?.reason ?? 'unknown approval',
        });
      }

      approval.used = true;

      return { approved: true as const };
    }),

    signOut: base.signOut.handler(({ context }) => {
      if (context.sessionToken !== null) {
        removeSession(context.sessionToken);
      }

      context.resHeaders?.append(
        'set-cookie',
        `${sessionCookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      );

      return { signedOut: context.sessionToken !== null };
    }),

    sync: base.sync.handler(({ context, input }) => {
      const { token, session } = requireSession(context);

      if (session.syncedMessages.has(input.messageID)) {
        return { duplicate: true };
      }

      session.syncedMessages.add(input.messageID);
      trimOldest(session.syncedMessages, probeLimits.syncedMessagesPerSession);
      writeLog('sync', token, {
        messageID: input.messageID,
        text: input.text,
        lastChance: input.lastChance,
        phoneClockDelayMs: options.now() - input.queuedAt,
      });

      return { duplicate: false };
    }),

    log: base.log.handler(({ context }) => {
      if (context.isAdmin) {
        return collectEveryEntry().map((stored) => stored.entry);
      }

      return requireSession(context)
        .session.log.map((stored) => stored.entry)
        .toReversed();
    }),

    entry: base.entry.handler(({ context, input }) => {
      const candidates = context.isAdmin
        ? collectEveryEntry()
        : requireSession(context).session.log;
      const stored = candidates.find((candidate) => candidate.entry.id === input.id);

      if (stored === undefined) {
        throw new ORPCError('NOT_FOUND', { message: 'unknown entry' });
      }

      return stored.entry;
    }),

    subscriptions: base.subscriptions.handler(({ context }) => {
      requireAdmin(context);

      return [...subscriptions.values()].map((subscription) => ({
        session: sessions.get(subscription.sessionToken)?.label ?? null,
        pushService: new URL(subscription.endpoint).host,
      }));
    }),
  });

  // newest first
  function collectEveryEntry(): StoredLogEntry[] {
    return [...sessions.values()]
      .flatMap((session) => session.log)
      .concat(anonymousLog)
      .toSorted((left, right) => right.order - left.order);
  }

  const rpcHandler = new RPCHandler(router, { plugins: [new ResponseHeadersPlugin()] });

  async function answerRPC(request: Request): Promise<Response> {
    // A cross-site form cannot send a custom header, so nixie's API refuses a call without one.
    if ((request.headers.get(clientHeaderName) ?? '') === '') {
      return new Response('the client header is missing', { status: 403 });
    }

    // the RPC handler reads the whole body before the contract checks its fields
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    const read = hasBody
      ? await readCappedBody(request, probeLimits.rpcBodyBytes, options.startBodyDeadline())
      : null;

    if (read !== null && read.kind !== 'read') {
      return answerUnreadBody(read, 'call');
    }

    const givenAdminKey = request.headers.get(adminHeaderName);
    const capped = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      ...(read === null ? {} : { body: read.body }),
    });
    const result = await rpcHandler.handle(capped, {
      prefix: rpcPrefix,
      context: {
        sessionToken: findSession(request),
        isAdmin:
          givenAdminKey !== null &&
          timingSafeEqual(hashSecret(givenAdminKey), hashSecret(options.adminKey)),
        cookieSent: request.headers.has('cookie'),
        secFetchSite: readHeaderValue(request, 'sec-fetch-site'),
        secFetchMode: readHeaderValue(request, 'sec-fetch-mode'),
      },
    });

    return result.matched ? result.response : new Response('not found', { status: 404 });
  }

  // The share sheet posts a browser form, which no RPC client builds, so the share target is a
  // plain route. Shares with a session and shares without one take slots from separate pools, so
  // anonymous shares never hold the slots a paired phone needs.
  async function answerShare(request: Request): Promise<Response> {
    const sessionToken = findSession(request);
    const pool = sessionToken === null ? 'anonymous' : 'session';

    if (sharesInFlight[pool] >= probeLimits.sharesInFlight) {
      return new Response('another share is in progress', { status: 503 });
    }

    sharesInFlight[pool] += 1;

    try {
      return await recordShare(request, sessionToken);
    } finally {
      sharesInFlight[pool] -= 1;
    }
  }

  async function recordShare(request: Request, sessionToken: string | null): Promise<Response> {
    const read = await readCappedBody(
      request,
      probeLimits.shareBodyBytes,
      options.startBodyDeadline(),
    );

    if (read.kind !== 'read') {
      return answerUnreadBody(read, 'share');
    }

    const form = await new Response(read.body, {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    })
      .formData()
      .catch(() => null);

    if (form === null) {
      return new Response('expected multipart/form-data', { status: 400 });
    }

    const files = form.getAll('files').filter((value) => value instanceof File);
    const fields = {
      title: capField(form.get('title'), probeLimits.shareFieldCharacters),
      text: capField(form.get('text'), probeLimits.shareFieldCharacters),
      url: capField(form.get('url'), probeLimits.shareFieldCharacters),
    };
    const entry = writeLog('share', sessionToken, {
      title: fields.title.value,
      text: fields.text.value,
      url: fields.url.value,
      truncated: Object.entries(fields)
        .filter(([, field]) => field.truncated)
        .map(([name]) => name),
      files: files.slice(0, probeLimits.shareFiles).map((file) => ({
        name: file.name.slice(0, probeLimits.fileNameCharacters),
        type: file.type.slice(0, probeLimits.fileNameCharacters),
        size: file.size,
      })),
      fileCount: files.length,
      cookieSent: request.headers.has('cookie'),
      sessionKnown: sessionToken !== null,
      secFetchSite: readHeaderValue(request, 'sec-fetch-site'),
    });

    // a 303 turns the share's POST into a GET, so a reload never posts the share again
    return new Response(null, {
      status: 303,
      headers: { location: `/block-6.html?share=${entry.id}` },
    });
  }

  // A page GET never starts a session, so an anonymous caller adds nothing to the server's state.
  function answerStatic(pathname: string): Promise<Response> {
    return match(pickStaticResponse(pathname, options.publicDirectory))
      .with({ kind: 'icon' }, async (decision) =>
        new Response(renderIconPNG(decision.size, decision.variant), {
          headers: { 'content-type': 'image/png' },
        }),
      )
      .with({ kind: 'asset' }, async (decision) => {
        const asset = options.clientAssets.get(decision.name);

        return asset === undefined
          ? new Response('not found', { status: 404 })
          : new Response(asset, {
              headers: {
                'content-type': 'text/javascript; charset=utf-8',
                'cache-control': 'no-cache',
              },
            });
      })
      .with({ kind: 'file' }, async (decision) => {
        const file = await options.readPublicFile(decision.path);

        return file === null
          ? new Response('not found', { status: 404 })
          : new Response(file, {
              headers: { 'content-type': decision.contentType, 'cache-control': 'no-cache' },
            });
      })
      .with({ kind: 'not-found' }, async () => new Response('not found', { status: 404 }))
      .exhaustive();
  }

  return async function answerRequest(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith(`${rpcPrefix}/`)) {
      return answerRPC(request);
    }

    if (request.method === 'POST' && pathname === '/share') {
      return answerShare(request);
    }

    if (request.method === 'GET') {
      return answerStatic(pathname);
    }

    return new Response('not found', { status: 404 });
  };
}

function answerUnreadBody(read: Exclude<CappedBody, { kind: 'read' }>, what: string): Response {
  return match(read)
    .with({ kind: 'too-large' }, () => new Response(`the ${what} is too large`, { status: 413 }))
    .with({ kind: 'too-slow' }, () => new Response(`the ${what} arrived too slowly`, { status: 408 }))
    .with({ kind: 'broken' }, () => new Response(`the ${what} broke off`, { status: 400 }))
    .exhaustive();
}

// The log keeps a copy of a few request headers; a browser's values are short words such as
// same-origin.
function readHeaderValue(request: Request, name: string): string | null {
  return request.headers.get(name)?.slice(0, probeLimits.headerValueCharacters) ?? null;
}

function capField(
  value: FormDataEntryValue | null,
  maxCharacters: number,
): { value: string | null; truncated: boolean } {
  return typeof value === 'string'
    ? { value: value.slice(0, maxCharacters), truncated: value.length > maxCharacters }
    : { value: null, truncated: false };
}
