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
import { renderIconPNG } from './render-icon-png.ts';
import { type PushSubscriptionRecord, type PushTransport, sendPush } from './send-push.ts';

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
const logLimit = 500;

export function makeProbeHandler(
  options: ProbeHandlerOptions,
): (request: Request) => Promise<Response> {
  // session cookie value → public label
  const sessions = new Map<string, string>();
  const subscriptions = new Map<string, StoredSubscription>();
  const approvals = new Map<string, StoredApproval>();
  const pushSentAt = new Map<string, number>();
  const syncedMessages = new Set<string>();
  const log: StoredLogEntry[] = [];

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
    log.splice(0, Math.max(0, log.length - logLimit));

    return entry;
  }

  function findSession(request: Request): string | null {
    const token = new Bun.CookieMap(request.headers.get('cookie') ?? '').get(sessionCookie);

    return token !== null && sessions.has(token) ? token : null;
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
      approval = { approvalID, token };
    }

    pushSentAt.set(pushID, sentAt);

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
        options.schedule(input.delaySeconds * 1000, async () => {
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

      writeLog('push-received', context.sessionToken, {
        pushID: input.pushID,
        phoneClockDelayMs: input.receivedAt - sentAt,
        reportedAfterMs: options.now() - sentAt,
      });

      return { recorded: true as const };
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

    const givenAdminKey = request.headers.get(adminHeaderName);
    const result = await rpcHandler.handle(request, {
      prefix: rpcPrefix,
      context: {
        sessionToken: findSession(request),
        isAdmin:
          givenAdminKey !== null &&
          timingSafeEqual(hashSecret(givenAdminKey), hashSecret(options.adminKey)),
        cookieSent: request.headers.has('cookie'),
        secFetchSite: request.headers.get('sec-fetch-site'),
        secFetchMode: request.headers.get('sec-fetch-mode'),
      },
    });

    return result.matched ? result.response : new Response('not found', { status: 404 });
  }

  // The share sheet posts a browser form, which no RPC client builds, so the share target is a
  // plain route.
  async function answerShare(request: Request): Promise<Response> {
    const sessionToken = findSession(request);
    const form = await request.formData().catch(() => null);

    if (form === null) {
      return new Response('expected multipart/form-data', { status: 400 });
    }

    const files = form
      .getAll('files')
      .filter((value) => value instanceof File)
      .map((file) => ({ name: file.name, type: file.type, size: file.size }));
    const entry = writeLog('share', sessionToken, {
      title: readField(form, 'title'),
      text: readField(form, 'text'),
      url: readField(form, 'url'),
      files,
      cookieSent: request.headers.has('cookie'),
      sessionKnown: sessionToken !== null,
      secFetchSite: request.headers.get('sec-fetch-site'),
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

    if (decision.kind === 'not-found' || !(await Bun.file(decision.path).exists())) {
      return new Response('not found', { status: 404 });
    }

    const headers = new Headers({ 'content-type': decision.contentType, 'cache-control': 'no-cache' });

    if (decision.startsSession) {
      const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

      sessions.set(token, `S-${crypto.randomUUID().slice(0, 8)}`);
      headers.append(
        'set-cookie',
        `${sessionCookie}=${token}; Path=/; Max-Age=${sessionMaxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`,
      );
    }

    return new Response(Bun.file(decision.path), { headers });
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

function readField(form: FormData, name: string): string | null {
  const value = form.get(name);

  return typeof value === 'string' ? value : null;
}
