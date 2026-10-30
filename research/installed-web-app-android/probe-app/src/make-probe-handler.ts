import { createHash, timingSafeEqual } from 'node:crypto';
import { extname, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { VapidKeys } from './build-vapid-authorization.ts';
import { renderIconPNG } from './render-icon-png.ts';
import { type PushSubscriptionRecord, sendPush } from './send-push.ts';

interface ProbeHandlerOptions {
  vapidKeys: VapidKeys;
  adminKey: string;
  publicDirectory: string;
  isPushEndpointAllowed: (endpoint: URL) => boolean;
  now: () => number;
}

export interface LogEntry {
  id: string;
  at: string;
  // the session's public label, never its cookie value
  session: string | null;
  kind: 'subscribed' | 'push-sent' | 'push-received' | 'approve' | 'share' | 'sync';
  detail: Record<string, unknown>;
}

interface Approval {
  tokenHash: Buffer;
  sessionToken: string;
  issuedAt: number;
  used: boolean;
}

interface StoredSubscription extends PushSubscriptionRecord {
  sessionToken: string;
}

// The same header and cookie check that nixie's API makes on each call.
const clientHeader = 'x-nixie-client';
const adminHeader = 'x-probe-admin';
const sessionCookie = 'probe_session';
const approvalLifetimeMs = 15 * 60 * 1000;
const sessionMaxAgeSeconds = 30 * 24 * 60 * 60;
const logLimit = 500;

const subscribeSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

const pushSchema = z.object({
  title: z.string().max(120).default('nixie probe'),
  urgency: z.enum(['very-low', 'low', 'normal', 'high']).default('normal'),
  tag: z.string().max(64).default(''),
  silent: z.boolean().default(false),
  renotify: z.boolean().default(false),
  approve: z.boolean().default(false),
  delaySeconds: z.number().int().min(0).max(3600).default(0),
});

const pushReceivedSchema = z.object({ pushID: z.uuid(), receivedAt: z.number() });

const approveSchema = z.object({ approvalID: z.uuid(), token: z.string().min(1).max(200) });

const syncSchema = z.object({
  messageID: z.uuid(),
  text: z.string().max(2000),
  queuedAt: z.number(),
  lastChance: z.boolean(),
});

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export function makeProbeHandler(options: ProbeHandlerOptions): (request: Request) => Promise<Response> {
  // session cookie value → public label
  const sessions = new Map<string, string>();
  const subscriptions = new Map<string, StoredSubscription>();
  const approvals = new Map<string, Approval>();
  const pushSentAt = new Map<string, number>();
  const syncedMessages = new Set<string>();
  const log: LogEntry[] = [];
  const publicRoot = resolve(options.publicDirectory);

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

    log.push(entry);
    log.splice(0, Math.max(0, log.length - logLimit));

    return entry;
  }

  function findSession(request: Request): string | null {
    const token = new Bun.CookieMap(request.headers.get('cookie') ?? '').get(sessionCookie);

    return token !== null && sessions.has(token) ? token : null;
  }

  function isAdmin(request: Request): boolean {
    const given = request.headers.get(adminHeader);

    return given !== null && isSameSecret(given, options.adminKey);
  }

  async function sendOne(
    subscription: StoredSubscription,
    push: z.infer<typeof pushSchema>,
    pushID: string,
  ): Promise<number> {
    const sentAt = options.now();
    let approval: { approvalID: string; token: string } | null = null;

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

    const status = await sendPush({
      subscription,
      payload: {
        pushID,
        sentAt,
        title: push.title,
        tag: push.tag,
        silent: push.silent,
        renotify: push.renotify,
        urgency: push.urgency,
        approval,
      },
      urgency: push.urgency,
      vapidKeys: options.vapidKeys,
      nowMs: sentAt,
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

  async function answerPush(request: Request): Promise<Response> {
    const admin = isAdmin(request);
    const sessionToken = findSession(request);

    if (!admin && (sessionToken === null || !request.headers.has(clientHeader))) {
      return Response.json({ error: 'needs the admin key or a session' }, { status: 401 });
    }

    const parsed = pushSchema.safeParse(await readJSON(request));

    if (!parsed.success) {
      return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
    }

    const targets = [...subscriptions.values()].filter(
      (subscription) => admin || subscription.sessionToken === sessionToken,
    );

    if (targets.length === 0) {
      return Response.json({ error: 'no subscription to send to' }, { status: 409 });
    }

    const pushID = crypto.randomUUID();
    const sendAll = () =>
      Promise.all(targets.map((subscription) => sendOne(subscription, parsed.data, pushID)));

    if (parsed.data.delaySeconds > 0) {
      setTimeout(() => void sendAll(), parsed.data.delaySeconds * 1000);

      return Response.json({ pushID, delaySeconds: parsed.data.delaySeconds }, { status: 202 });
    }

    return Response.json({ pushID, statuses: await sendAll() });
  }

  async function answerSubscribe(request: Request): Promise<Response> {
    const sessionToken = findSession(request);

    if (!request.headers.has(clientHeader)) {
      return Response.json({ error: `missing ${clientHeader}` }, { status: 400 });
    }

    if (sessionToken === null) {
      return Response.json({ error: 'no session' }, { status: 401 });
    }

    const parsed = subscribeSchema.safeParse(await readJSON(request));

    if (!parsed.success) {
      return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
    }

    if (!options.isPushEndpointAllowed(new URL(parsed.data.endpoint))) {
      return Response.json({ error: 'unknown push service' }, { status: 400 });
    }

    subscriptions.set(parsed.data.endpoint, {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      sessionToken,
    });
    writeLog('subscribed', sessionToken, { pushService: new URL(parsed.data.endpoint).host });

    return Response.json({ subscribed: true });
  }

  async function answerPushReceived(request: Request): Promise<Response> {
    const parsed = pushReceivedSchema.safeParse(await readJSON(request));

    if (!request.headers.has(clientHeader) || !parsed.success) {
      return Response.json({ error: 'bad report' }, { status: 400 });
    }

    const sentAt = pushSentAt.get(parsed.data.pushID);

    if (sentAt === undefined) {
      return Response.json({ error: 'unknown push' }, { status: 404 });
    }

    writeLog('push-received', findSession(request), {
      pushID: parsed.data.pushID,
      phoneClockDelayMs: parsed.data.receivedAt - sentAt,
      reportedAfterMs: options.now() - sentAt,
    });

    return Response.json({ recorded: true });
  }

  async function answerApprove(request: Request): Promise<Response> {
    const sessionToken = findSession(request);
    const context = {
      clientHeader: request.headers.has(clientHeader),
      cookieSent: request.headers.has('cookie'),
      sessionKnown: sessionToken !== null,
      secFetchSite: request.headers.get('sec-fetch-site'),
      secFetchMode: request.headers.get('sec-fetch-mode'),
    };
    const parsed = approveSchema.safeParse(await readJSON(request));
    const approval = parsed.success ? approvals.get(parsed.data.approvalID) : undefined;
    const refusal = pickApprovalRefusal({
      hasClientHeader: context.clientHeader,
      sessionToken,
      approval,
      token: parsed.success ? parsed.data.token : null,
      nowMs: options.now(),
    });

    writeLog('approve', sessionToken, {
      ...context,
      approvalID: parsed.success ? parsed.data.approvalID : null,
      outcome: refusal?.reason ?? 'approved',
    });

    if (refusal !== null || approval === undefined) {
      return Response.json(
        { error: refusal?.reason ?? 'unknown approval' },
        { status: refusal?.status ?? 404 },
      );
    }

    approval.used = true;

    return Response.json({ approved: true });
  }

  async function answerShare(request: Request): Promise<Response> {
    const sessionToken = findSession(request);
    const form = await request.formData().catch(() => null);

    if (form === null) {
      return Response.json({ error: 'expected multipart/form-data' }, { status: 400 });
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

  async function answerSync(request: Request): Promise<Response> {
    const sessionToken = findSession(request);

    if (!request.headers.has(clientHeader)) {
      return Response.json({ error: `missing ${clientHeader}` }, { status: 400 });
    }

    if (sessionToken === null) {
      return Response.json({ error: 'no session' }, { status: 401 });
    }

    const parsed = syncSchema.safeParse(await readJSON(request));

    if (!parsed.success) {
      return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
    }

    if (syncedMessages.has(parsed.data.messageID)) {
      return Response.json({ duplicate: true });
    }

    syncedMessages.add(parsed.data.messageID);
    writeLog('sync', sessionToken, {
      messageID: parsed.data.messageID,
      text: parsed.data.text,
      lastChance: parsed.data.lastChance,
      phoneClockDelayMs: options.now() - parsed.data.queuedAt,
    });

    return Response.json({ duplicate: false });
  }

  function answerLog(request: Request): Response {
    if (isAdmin(request)) {
      return Response.json(log.toReversed());
    }

    const sessionToken = findSession(request);

    if (sessionToken === null) {
      return Response.json({ error: 'no session' }, { status: 401 });
    }

    const label = sessions.get(sessionToken);

    return Response.json(log.filter((entry) => entry.session === label).toReversed());
  }

  function answerSubscriptions(request: Request): Response {
    if (!isAdmin(request)) {
      return Response.json({ error: 'needs the admin key' }, { status: 401 });
    }

    return Response.json(
      [...subscriptions.values()].map((subscription) => ({
        session: sessions.get(subscription.sessionToken) ?? null,
        pushService: new URL(subscription.endpoint).host,
      })),
    );
  }

  async function answerStatic(request: Request, pathname: string): Promise<Response> {
    const iconMatch = /^\/icons\/(launcher|badge)-(\d+)\.png$/.exec(pathname);

    if (iconMatch !== null) {
      const kind = iconMatch[1] === 'badge' ? 'badge' : 'launcher';
      const size = Number(iconMatch[2]);

      if (![96, 192, 512].includes(size)) {
        return new Response('not found', { status: 404 });
      }

      return new Response(renderIconPNG(size, kind), { headers: { 'content-type': 'image/png' } });
    }

    const path = resolve(publicRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    const file = Bun.file(path);

    if (!path.startsWith(publicRoot + sep) || !(await file.exists())) {
      return new Response('not found', { status: 404 });
    }

    const headers = new Headers({
      'content-type': contentTypes[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });

    if (extname(path) === '.html' && findSession(request) === null) {
      const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

      sessions.set(token, `S-${crypto.randomUUID().slice(0, 6)}`);
      headers.append(
        'set-cookie',
        `${sessionCookie}=${token}; Path=/; Max-Age=${sessionMaxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`,
      );
    }

    return new Response(file, { headers });
  }

  return async function answerRequest(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const route = `${request.method} ${pathname}`;

    if (route === 'GET /api/config') {
      const sessionToken = findSession(request);

      return Response.json({
        vapidPublicKey: options.vapidKeys.publicKey,
        session: sessionToken === null ? null : (sessions.get(sessionToken) ?? null),
      });
    }

    if (route === 'POST /api/subscribe') {
      return answerSubscribe(request);
    }

    if (route === 'POST /api/push') {
      return answerPush(request);
    }

    if (route === 'POST /api/push-received') {
      return answerPushReceived(request);
    }

    if (route === 'POST /api/approve') {
      return answerApprove(request);
    }

    if (route === 'POST /api/sign-out') {
      const sessionToken = findSession(request);

      if (sessionToken !== null) {
        sessions.delete(sessionToken);
      }

      return Response.json(
        { signedOut: sessionToken !== null },
        {
          headers: {
            'set-cookie': `${sessionCookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
          },
        },
      );
    }

    if (route === 'POST /share') {
      return answerShare(request);
    }

    if (route === 'POST /api/sync') {
      return answerSync(request);
    }

    if (route === 'GET /api/log') {
      return answerLog(request);
    }

    if (route === 'GET /api/subscriptions') {
      return answerSubscriptions(request);
    }

    const entryMatch = /^GET \/api\/entries\/([0-9a-f-]{36})$/.exec(route);

    if (entryMatch !== null) {
      const entry = log.find((candidate) => candidate.id === entryMatch[1]);

      return entry === undefined
        ? Response.json({ error: 'unknown entry' }, { status: 404 })
        : Response.json(entry);
    }

    if (request.method === 'GET') {
      return answerStatic(request, pathname);
    }

    return new Response('not found', { status: 404 });
  };
}

interface ApprovalCheck {
  hasClientHeader: boolean;
  sessionToken: string | null;
  approval: Approval | undefined;
  token: string | null;
  nowMs: number;
}

function pickApprovalRefusal(check: ApprovalCheck): { status: number; reason: string } | null {
  if (!check.hasClientHeader) {
    return { status: 400, reason: `missing ${clientHeader}` };
  }

  if (check.sessionToken === null) {
    return { status: 401, reason: 'no session' };
  }

  if (check.approval === undefined || check.token === null) {
    return { status: 404, reason: 'unknown approval' };
  }

  if (!timingSafeEqual(hashSecret(check.token), check.approval.tokenHash)) {
    return { status: 403, reason: 'wrong token' };
  }

  if (check.approval.sessionToken !== check.sessionToken) {
    return { status: 403, reason: 'another session' };
  }

  if (check.approval.used) {
    return { status: 409, reason: 'token already used' };
  }

  if (check.nowMs - check.approval.issuedAt > approvalLifetimeMs) {
    return { status: 410, reason: 'token expired' };
  }

  return null;
}

function hashSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function isSameSecret(given: string, expected: string): boolean {
  return timingSafeEqual(hashSecret(given), hashSecret(expected));
}

function readJSON(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

function readField(form: FormData, name: string): string | null {
  const value = form.get(name);

  return typeof value === 'string' ? value : null;
}
