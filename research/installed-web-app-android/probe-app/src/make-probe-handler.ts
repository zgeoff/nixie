import { timingSafeEqual } from 'node:crypto';
import { ORPCError, implement } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { ResponseHeadersPlugin, type ResponseHeadersPluginContext } from '@orpc/server/plugins';
import type { z } from 'zod';
import type { VapidKeys } from './build-vapid-authorization.ts';
import {
  adminHeaderName,
  clientHeaderName,
  type LogEntry,
  type PushPayload,
  probeContract,
  type pushInputSchema,
  rpcPrefix,
} from './contract.ts';
import { hashSecret } from './hash-secret.ts';
import { pickApprovalRefusal, type StoredApproval } from './pick-approval-refusal.ts';
import { pickStaticResponse } from './pick-static-response.ts';
import { readCappedBody } from './read-capped-body.ts';
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

// The log keeps each entry's session cookie value beside it for access checks, and never sends it.
interface StoredLogEntry {
  entry: LogEntry;
  sessionToken: string | null;
}

const sessionCookie = 'probe_session';
const approvalLifetimeMs = 15 * 60 * 1000;
const sessionMaxAgeSeconds = 30 * 24 * 60 * 60;

// Anyone who reaches the public URL can call the server, so every request it keeps from bounds
// both its count and its size.
export const probeLimits = {
  logEntries: 500,
  sessions: 1000,
  subscriptions: 50,
  approvals: 1000,
  pushes: 1000,
  syncedMessages: 5000,
  receipts: 5000,
  delayedPushes: 20,
  rpcBodyBytes: 64 * 1024,
  // a phone photo fits; the server keeps only each file's name, type and size
  shareBodyBytes: 25 * 1024 * 1024,
  sharesInFlight: 2,
  shareFieldCharacters: 2000,
  shareFiles: 20,
  fileNameCharacters: 200,
  headerValueCharacters: 100,
};

export function makeProbeHandler(
  options: ProbeHandlerOptions,
): (request: Request) => Promise<Response> {
  // session cookie value → public label, least recently used first
  const sessions = new Map<string, string>();
  const subscriptions = new Map<string, StoredSubscription>();
  const approvals = new Map<string, StoredApproval>();
  const pushSentAt = new Map<string, number>();
  const syncedMessages = new Set<string>();
  // push ID and session of each receipt the log holds
  const receipts = new Set<string>();
  const log: StoredLogEntry[] = [];
  let delayedPushes = 0;
  let sharesInFlight = 0;

  function writeLog(
    kind: LogEntry['kind'],
    sessionToken: string | null,
    detail: Record<string, unknown>,
  ): LogEntry {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      at: new Date(options.now()).toISOString(),
      session: sessionToken === null ? null : (sessions.get(sessionToken) ?? null),
      kind,
      detail,
    };

    log.push({ entry, sessionToken });
    log.splice(0, Math.max(0, log.length - probeLimits.logEntries));

    return entry;
  }

  function findSession(request: Request): string | null {
    const token = new Bun.CookieMap(request.headers.get('cookie') ?? '').get(sessionCookie);
    const label = token === null ? undefined : sessions.get(token);

    if (token === null || label === undefined) {
      return null;
    }

    // a session in use moves to the back, so the oldest one past the limit is the least used
    sessions.delete(token);
    sessions.set(token, label);

    return token;
  }

  async function sendOne(
    subscription: StoredSubscription,
    push: z.infer<typeof pushInputSchema>,
    pushID: string,
  ): Promise<number> {
    const sentAt = options.now();
    let approval: PushPayload['approval'] = null;

    if (push.approve) {
      const approvalID = crypto.randomUUID();
      const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

      approvals.set(approvalID, {
        tokenHash: hashSecret(token),
        sessionToken: subscription.sessionToken,
        issuedAt: sentAt,
        used: false,
      });
      trimOldest(approvals, probeLimits.approvals);
      approval = { approvalID, token };
    }

    pushSentAt.set(pushID, sentAt);
    trimOldest(pushSentAt, probeLimits.pushes);

    const payload: PushPayload = {
      pushID,
      sentAt,
      title: push.title,
      tag: push.tag,
      silent: push.silent,
      renotify: push.renotify,
      urgency: push.urgency,
      approval,
    };
    const status = await sendPush({
      subscription,
      payload,
      urgency: push.urgency,
      vapidKeys: options.vapidKeys,
      nowMs: sentAt,
      transport: options.pushTransport,
    }).catch((error: unknown) => {
      console.error('push send failed', error);

      return 0;
    });

    if (status === 404 || status === 410) {
      subscriptions.delete(subscription.endpoint);
    }

    writeLog('push-sent', subscription.sessionToken, {
      pushID,
      pushService: new URL(subscription.endpoint).host,
      status,
      urgency: push.urgency,
      tag: push.tag,
      silent: push.silent,
      renotify: push.renotify,
      approvalID: approval?.approvalID ?? null,
    });

    return status;
  }

  const base = implement(probeContract).$context<ProbeContext>();

  function requireSession(context: ProbeContext): string {
    if (context.sessionToken === null) {
      throw new ORPCError('UNAUTHORIZED', { message: 'no session' });
    }

    return context.sessionToken;
  }

  const router = base.router({
    config: base.config.handler(({ context }) => ({
      vapidPublicKey: options.vapidKeys.publicKey,
      session: context.sessionToken === null ? null : (sessions.get(context.sessionToken) ?? null),
    })),

    subscribe: base.subscribe.handler(({ context, input }) => {
      const sessionToken = requireSession(context);

      if (!options.isPushEndpointAllowed(new URL(input.endpoint))) {
        throw new ORPCError('BAD_REQUEST', { message: 'unknown push service' });
      }

      subscriptions.set(input.endpoint, {
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        sessionToken,
      });
      trimOldest(subscriptions, probeLimits.subscriptions);
      writeLog('subscribed', sessionToken, { pushService: new URL(input.endpoint).host });

      return { subscribed: true as const };
    }),

    push: base.push.handler(async ({ context, input }) => {
      if (!context.isAdmin) {
        requireSession(context);
      }

      const targets = [...subscriptions.values()].filter(
        (subscription) => context.isAdmin || subscription.sessionToken === context.sessionToken,
      );

      if (targets.length === 0) {
        throw new ORPCError('CONFLICT', { message: 'no subscription to send to' });
      }

      const pushID = crypto.randomUUID();
      const sendAll = () =>
        Promise.all(targets.map((subscription) => sendOne(subscription, input, pushID)));

      if (input.delaySeconds > 0) {
        if (delayedPushes >= probeLimits.delayedPushes) {
          throw new ORPCError('TOO_MANY_REQUESTS', { message: 'too many delayed pushes waiting' });
        }

        delayedPushes += 1;
        options.schedule(input.delaySeconds * 1000, async () => {
          delayedPushes -= 1;
          await sendAll();
        });

        return { pushID, delaySeconds: input.delaySeconds, statuses: null };
      }

      return { pushID, delaySeconds: 0, statuses: await sendAll() };
    }),

    pushReceived: base.pushReceived.handler(({ context, input }) => {
      const sentAt = pushSentAt.get(input.pushID);

      if (sentAt === undefined) {
        throw new ORPCError('NOT_FOUND', { message: 'unknown push' });
      }

      // a report whose answer got lost comes again, and a page and the service worker can report
      // the same receipt at once; the log keeps one entry for each push a session received
      const receiptKey = `${input.pushID} ${context.sessionToken ?? 'no session'}`;

      if (receipts.has(receiptKey)) {
        return { recorded: true as const, duplicate: true };
      }

      receipts.add(receiptKey);
      trimOldest(receipts, probeLimits.receipts);
      writeLog('push-received', context.sessionToken, {
        pushID: input.pushID,
        phoneClockDelayMs: input.receivedAt - sentAt,
        reportedAfterMs: options.now() - sentAt,
      });

      return { recorded: true as const, duplicate: false };
    }),

    approve: base.approve.handler(({ context, input }) => {
      const approval = approvals.get(input.approvalID);
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
        sessions.delete(context.sessionToken);
      }

      context.resHeaders?.append(
        'set-cookie',
        `${sessionCookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      );

      return { signedOut: context.sessionToken !== null };
    }),

    sync: base.sync.handler(({ context, input }) => {
      const sessionToken = requireSession(context);

      if (syncedMessages.has(input.messageID)) {
        return { duplicate: true };
      }

      syncedMessages.add(input.messageID);
      trimOldest(syncedMessages, probeLimits.syncedMessages);
      writeLog('sync', sessionToken, {
        messageID: input.messageID,
        text: input.text,
        lastChance: input.lastChance,
        phoneClockDelayMs: options.now() - input.queuedAt,
      });

      return { duplicate: false };
    }),

    log: base.log.handler(({ context }) => {
      if (context.isAdmin) {
        return log.map((stored) => stored.entry).toReversed();
      }

      const sessionToken = requireSession(context);

      return log
        .filter((stored) => stored.sessionToken === sessionToken)
        .map((stored) => stored.entry)
        .toReversed();
    }),

    entry: base.entry.handler(({ input }) => {
      const stored = log.find((candidate) => candidate.entry.id === input.id);

      if (stored === undefined) {
        throw new ORPCError('NOT_FOUND', { message: 'unknown entry' });
      }

      return stored.entry;
    }),

    subscriptions: base.subscriptions.handler(({ context }) => {
      if (!context.isAdmin) {
        throw new ORPCError('UNAUTHORIZED', { message: 'needs the admin key' });
      }

      return [...subscriptions.values()].map((subscription) => ({
        session: sessions.get(subscription.sessionToken) ?? null,
        pushService: new URL(subscription.endpoint).host,
      }));
    }),
  });

  const rpcHandler = new RPCHandler(router, { plugins: [new ResponseHeadersPlugin()] });

  async function answerRPC(request: Request): Promise<Response> {
    // A cross-site form cannot send a custom header, so nixie's API refuses a call without one.
    if ((request.headers.get(clientHeaderName) ?? '') === '') {
      return new Response('the client header is missing', { status: 403 });
    }

    // the RPC handler reads the whole body before the contract checks its fields
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    const body = hasBody ? await readCappedBody(request, probeLimits.rpcBodyBytes) : null;

    if (hasBody && body === null) {
      return new Response('the call is too large', { status: 413 });
    }

    const givenAdminKey = request.headers.get(adminHeaderName);
    const capped = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      ...(body === null ? {} : { body }),
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
  // plain route.
  async function answerShare(request: Request): Promise<Response> {
    // each share in flight holds its body in memory, so only a few run at once
    if (sharesInFlight >= probeLimits.sharesInFlight) {
      return new Response('another share is in progress', { status: 503 });
    }

    sharesInFlight += 1;

    const body = await readCappedBody(request, probeLimits.shareBodyBytes).finally(() => {
      sharesInFlight -= 1;
    });

    if (body === null) {
      return new Response('the share is too large', { status: 413 });
    }

    const sessionToken = findSession(request);
    const form = await new Response(body, {
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

  async function answerStatic(request: Request, pathname: string): Promise<Response> {
    const decision = pickStaticResponse(
      pathname,
      options.publicDirectory,
      findSession(request) !== null,
    );

    if (decision.kind === 'icon') {
      return new Response(renderIconPNG(decision.size, decision.variant), {
        headers: { 'content-type': 'image/png' },
      });
    }

    if (decision.kind === 'asset') {
      const asset = options.clientAssets.get(decision.name);

      return asset === undefined
        ? new Response('not found', { status: 404 })
        : new Response(asset, {
            headers: {
              'content-type': 'text/javascript; charset=utf-8',
              'cache-control': 'no-cache',
            },
          });
    }

    const file = decision.kind === 'file' ? await options.readPublicFile(decision.path) : null;

    if (decision.kind === 'not-found' || file === null) {
      return new Response('not found', { status: 404 });
    }

    const headers = new Headers({ 'content-type': decision.contentType, 'cache-control': 'no-cache' });

    if (decision.startsSession) {
      const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

      sessions.set(token, `S-${crypto.randomUUID().slice(0, 8)}`);
      trimOldest(sessions, probeLimits.sessions);
      headers.append(
        'set-cookie',
        `${sessionCookie}=${token}; Path=/; Max-Age=${sessionMaxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`,
      );
    }

    return new Response(file, { headers });
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
      return answerStatic(request, pathname);
    }

    return new Response('not found', { status: 404 });
  };
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
