/* oxlint-disable one-var, no-await-in-loop, new-cap -- the log stream waits for each append in turn, and oRPC names its error constructors in capitals */
// Implements the contract once and serves it 2 ways: over HTTP through Elysia, where the log
// stream is server-sent events, and over a WebSocket on Bun.serve.
import { once } from 'node:events';
import { ORPCError, implement, withEventMeta } from '@orpc/server';
import { RPCHandler as WsHandler } from '@orpc/server/bun-ws';
import { RPCHandler as FetchHandler } from '@orpc/server/fetch';
import { Elysia } from 'elysia';
import type { LogRecord } from './contract.ts';
import { contract } from './contract.ts';

export const SESSION_TOKEN = 'spike-session';

interface Context {
  token: string | null;
}

interface RouteContext {
  request: Request;
}

interface HttpServer {
  stop: (closeActiveConnections?: boolean) => Promise<unknown>;
}

const log: LogRecord[] = [];
const sent = new Map<string, number>();
const wake = new EventTarget();
const proposals = new Map([['p1', 'hash-of-rendered-action']]);

export function writeRecord(thread: string, kind: string, text: string): LogRecord {
  const record = { kind, sequence: log.length + 1, text, thread };
  log.push(record);
  wake.dispatchEvent(new Event('append'));
  return record;
}

async function waitForAppend(signal: AbortSignal | undefined): Promise<void> {
  try {
    await once(wake, 'append', { signal });
  } catch {
    // An aborted wait ends the stream; the caller checks the signal.
  }
}

const base = implement(contract).$context<Context>();
const authed = base.use((options) => {
  if (options.context.token !== SESSION_TOKEN) {
    throw new ORPCError('UNAUTHORIZED');
  }
  return options.next();
});

export const router = authed.router({
  approvals: {
    approve: authed.approvals.approve.handler((options) => {
      if (proposals.get(options.input.proposalId) !== options.input.actionHash) {
        throw options.errors.CONFLICT();
      }
      proposals.delete(options.input.proposalId);
      const record = writeRecord('main', 'approval_given', options.input.proposalId);
      return { approvalSequence: record.sequence };
    }),
  },
  conversation: {
    send: authed.conversation.send.handler((options) => {
      const earlier = sent.get(options.input.clientMessageId);
      if (earlier !== undefined) {
        return { duplicate: true, sequence: earlier };
      }
      const record = writeRecord(options.input.thread, 'owner_message', options.input.text);
      sent.set(options.input.clientMessageId, record.sequence);
      return { duplicate: false, sequence: record.sequence };
    }),
  },
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
          yield withEventMeta(record, { id: String(record.sequence), retry: 100 });
        }
        if (pending.length === 0) {
          await waitForAppend(options.signal);
        }
      }
    }),
  },
});

const fetchHandler = new FetchHandler(router);
const wsHandler = new WsHandler(router);

function readToken(request: Request): string | null {
  return request.headers.get('authorization')?.replace('Bearer ', '') ?? null;
}

export function startHttp(port: number): HttpServer {
  return new Elysia()
    .all(
      '/rpc*',
      async (context: RouteContext) => {
        const result = await fetchHandler.handle(context.request, {
          context: { token: readToken(context.request) },
          prefix: '/rpc',
        });
        return result.response ?? new Response('Not found', { status: 404 });
      },
      { parse: 'none' },
    )
    .listen(port);
}

export function startWs(port: number): ReturnType<typeof Bun.serve> {
  return Bun.serve<Context>({
    fetch(request, server) {
      // A browser WebSocket cannot set headers, so the session travels in the protocol list.
      const token = request.headers.get('sec-websocket-protocol');
      const upgraded = server.upgrade(request, {
        data: { token },
        headers: token ? { 'Sec-WebSocket-Protocol': token } : {},
      });
      if (upgraded) {
        return;
      }
      return new Response('Upgrade failed', { status: 400 });
    },
    port,
    websocket: {
      close(ws) {
        wsHandler.close(ws);
      },
      async message(ws, message) {
        await wsHandler.message(ws, message, { context: { token: ws.data.token } });
      },
    },
  });
}
