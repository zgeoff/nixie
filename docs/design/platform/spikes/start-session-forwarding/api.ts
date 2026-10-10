/* oxlint-disable one-var, max-statements, max-lines-per-function, no-await-in-loop -- spike code, grouped for reading; the log stream waits for each append in turn */
// nixie's API stand-in: oRPC through Elysia. It is the one place that checks a device session. A
// call carries the session as the browser's cookie or as a bearer token, and every call needs the
// custom header that a cross-site form cannot send.
import { once } from 'node:events';
import { ORPCError, implement, withEventMeta } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { Elysia } from 'elysia';
import { contract } from './contract.ts';

export const SESSION_COOKIE = 'nixie_session';
export const CLIENT_HEADER = 'x-nixie-client';

interface Session {
  device: string;
  id: string;
  revoked: boolean;
}

interface Context {
  token: string | null;
  via: string;
}

interface CallRecord {
  ok: boolean;
  path: string;
  via: string;
}

const sessions = new Map<string, Session>();
const calls: CallRecord[] = [];
const log: { sequence: number; text: string }[] = [];
const wake = new EventTarget();

function deriveTokenHash(token: string): string {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex');
}

export function createSession(device: string): string {
  const token = crypto.randomUUID();
  sessions.set(deriveTokenHash(token), { device, id: `s-${sessions.size + 1}`, revoked: false });
  return token;
}

function writeRecord(text: string): void {
  log.push({ sequence: log.length + 1, text });
  wake.dispatchEvent(new Event('append'));
}

const base = implement(contract).$context<Context>();
const authed = base.use((options) => {
  const session = options.context.token
    ? sessions.get(deriveTokenHash(options.context.token))
    : undefined;
  if (!session || session.revoked) {
    throw new ORPCError('UNAUTHORIZED');
  }
  return options.next({ context: { session } });
});

const router = authed.router({
  log: {
    follow: authed.log.follow.handler(async function* follow(options) {
      let after =
        options.lastEventId === undefined ? options.input.after : Number(options.lastEventId);
      for (;;) {
        if (options.signal?.aborted) {
          return;
        }
        const pending = log.slice(after);
        for (const record of pending) {
          after = record.sequence;
          yield withEventMeta(record, { id: String(record.sequence) });
        }
        if (pending.length === 0) {
          try {
            await once(wake, 'append', { signal: options.signal });
          } catch {
            return;
          }
        }
      }
    }),
  },
  tasks: {
    list: authed.tasks.list.handler(() => [
      { id: 't1', status: 'running', title: 'Inbox triage' },
      { id: 't2', status: 'waiting', title: 'Book a table' },
    ]),
  },
  whoami: authed.whoami.handler((options) => ({
    device: options.context.session.device,
    sessionId: options.context.session.id,
    via: options.context.via,
  })),
});

const handler = new RPCHandler(router);

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return rest.join('=');
    }
  }
  return null;
}

function readSession(request: Request): Context {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /u, '');
  if (bearer) {
    return { token: bearer, via: 'bearer' };
  }
  const cookie = readCookie(request, SESSION_COOKIE);
  return cookie ? { token: cookie, via: 'cookie' } : { token: null, via: 'none' };
}

interface ApiOptions {
  port: number;
  webOrigin: string;
}

interface RouteContext {
  request: Request;
}

interface IdContext {
  params: { id: string };
}

interface TextContext {
  params: { text: string };
}

export function startApi(options: ApiOptions): { stop: () => Promise<unknown> } {
  const cors = {
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': `content-type, ${CLIENT_HEADER}, last-event-id`,
    'access-control-allow-methods': 'GET, POST',
    'access-control-allow-origin': options.webOrigin,
    vary: 'origin',
  };
  const readCors = (request: Request): Record<string, string> =>
    request.headers.get('origin') === options.webOrigin ? cors : {};
  const app = new Elysia()
    .options(
      '/rpc*',
      (context: RouteContext) =>
        new Response(null, { headers: readCors(context.request), status: 204 }),
    )
    .all(
      '/rpc*',
      async (context: RouteContext) => {
        const request = context.request;
        const path = new URL(request.url).pathname;
        const auth = readSession(request);
        if (request.headers.get(CLIENT_HEADER) !== '1') {
          calls.push({ ok: false, path, via: auth.via });
          return new Response('Missing client header', { headers: readCors(request), status: 403 });
        }
        const result = await handler.handle(request, { context: auth, prefix: '/rpc' });
        const response = result.response ?? new Response('Not found', { status: 404 });
        calls.push({ ok: response.ok, path, via: auth.via });
        for (const [key, value] of Object.entries(readCors(request))) {
          response.headers.set(key, value);
        }
        return response;
      },
      { parse: 'none' },
    )

    // Test hooks on the stand-in only: read the call record, revoke a session, append a record.
    .get('/test/calls', () => Response.json(calls.splice(0)))
    .post('/test/revoke/:id', (context: IdContext) => {
      for (const session of sessions.values()) {
        if (session.id === context.params.id) {
          session.revoked = true;
        }
      }
      return 'ok';
    })
    .post('/test/append/:text', (context: TextContext) => {
      writeRecord(context.params.text);
      return 'ok';
    })
    .listen({ hostname: '127.0.0.1', port: options.port });
  return { stop: () => app.stop(true) };
}
