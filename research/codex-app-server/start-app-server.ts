import { match } from 'ts-pattern';
import { z } from 'zod';
import { parseServerMessage } from './parse-server-message.ts';

export interface Notification {
  readonly method: string;
  readonly params: unknown;
}

export interface AppServer {
  // every message in both directions, in the order the client saw them
  readonly log: unknown[];
  readonly request: (method: string, params: unknown) => Promise<unknown>;
  readonly notify: (method: string) => void;

  // resolves with the first notification at or after log position `since` that has `method` and
  // passes `test`, including one that arrived before the call
  readonly waitFor: (
    method: string,
    since: number,
    test: (params: unknown) => boolean,
  ) => Promise<Notification>;
  readonly stop: () => Promise<void>;
}

interface LoggedNotification {
  readonly position: number;
  readonly notification: Notification;
}

interface Waiter {
  readonly method: string;
  readonly test: (params: unknown) => boolean;
  readonly resolve: (notification: Notification) => void;
  readonly reject: (error: Error) => void;
}

const waitMs = 180_000;

const logFields = z.record(z.string(), z.unknown());

// The reply to a request the server sends the client, such as an approval or a token refresh.
export type ServerRequestReply = { readonly result: unknown } | { readonly error: unknown };

// A running `codex app-server`, which speaks JSON-RPC on stdio: one JSON message per line.
export interface AppServerProcess {
  readonly stdin: { readonly write: (text: string) => unknown; readonly end: () => unknown };
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  readonly kill: () => void;
}

// Codex reports these as they stream; the spike reads the completed items instead.
const quietNotifications = [
  'item/agentMessage/delta',
  'item/reasoning/summaryTextDelta',
  'item/reasoning/summaryPartAdded',
  'item/reasoning/textDelta',
];

// Opens a client on `child` and runs the `initialize` handshake, opted in to the experimental API.
export async function startAppServer(
  child: AppServerProcess,
  answerServerRequest: (method: string, params: unknown) => ServerRequestReply,
): Promise<AppServer> {
  const server = openClient(child, answerServerRequest);

  try {
    await server.request('initialize', {
      clientInfo: { name: 'nixie-spike', title: null, version: '0.0.0' },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: quietNotifications,
      },
    });
  } catch (error) {
    await server.stop();
    throw error;
  }
  server.notify('initialized');
  return server;
}

function openClient(
  child: AppServerProcess,
  answerServerRequest: (method: string, params: unknown) => ServerRequestReply,
): AppServer {
  const log: unknown[] = [];
  const pending = new Map<number, PromiseWithResolvers<unknown>>();
  const waiters = new Set<Waiter>();
  const notifications: LoggedNotification[] = [];
  const diagnostics = new Response(child.stderr)
    .text()
    .catch((error: unknown) => `stderr could not be read: ${String(error)}`);
  let nextID = 1;
  let failure: Error | null = null;

  function send(value: object): void {
    log.push({ from: 'client', ...value });
    child.stdin.write(`${JSON.stringify(value)}\n`);
  }

  function handleMessage(line: string): void {
    const raw: unknown = JSON.parse(line);
    const fields = logFields.safeParse(raw);

    log.push(fields.success ? { from: 'server', ...fields.data } : { from: 'server', raw });
    match(parseServerMessage(raw))
      .with({ kind: 'request' }, (request) => {
        send({ id: request.id, ...answerServerRequest(request.method, request.params) });
      })
      .with({ kind: 'notification' }, ({ method, params }) => {
        deliverNotification({ method, params });
      })
      .with({ kind: 'result' }, (reply) => {
        pending.get(reply.id)?.resolve(reply.result);
        pending.delete(reply.id);
      })
      .with({ kind: 'error' }, (reply) => {
        pending.get(reply.id)?.reject(new Error(JSON.stringify(reply.error)));
        pending.delete(reply.id);
      })
      .with({ kind: 'unmatched' }, () => {})
      .exhaustive();
  }

  function deliverNotification(notification: Notification): void {
    notifications.push({ position: log.length - 1, notification });
    for (const waiter of waiters) {
      if (waiter.method === notification.method && waiter.test(notification.params)) {
        waiters.delete(waiter);
        waiter.resolve(notification);
      }
    }
  }

  function failOpenCalls(error: Error): void {
    failure ??= error;
    for (const call of pending.values()) {
      call.reject(failure);
    }
    pending.clear();
    for (const waiter of waiters) {
      waiter.reject(failure);
    }
    waiters.clear();
  }

  const reading = readLines(child.stdout, handleMessage).catch((error: unknown) => {
    const message = `the app-server client failed on stdout: ${String(error)}`;

    failOpenCalls(new Error(message, { cause: error }));
  });
  const exiting = child.exited.then(async (exitCode) => {
    failOpenCalls(new Error(formatExit(exitCode, await diagnostics)));
  });

  return {
    log,
    request: async (method, params) => {
      if (failure) {
        throw failure;
      }
      const id = nextID;
      const call = Promise.withResolvers<unknown>();

      nextID += 1;
      pending.set(id, call);
      return withDeadline(`${method} response`, async () => {
        send({ id, method, params });
        return call.promise;
      });
    },
    notify: (method) => {
      send({ method });
    },
    waitFor: async (method, since, test) => {
      const earlier = notifications.find(
        (entry) =>
          entry.position >= since &&
          entry.notification.method === method &&
          test(entry.notification.params),
      );

      if (earlier) {
        return earlier.notification;
      }
      if (failure) {
        throw failure;
      }
      const found = Promise.withResolvers<Notification>();
      const waiter = { method, test, resolve: found.resolve, reject: found.reject };

      return withDeadline(method, async () => {
        waiters.add(waiter);
        return found.promise;
      }).finally(() => {
        waiters.delete(waiter);
      });
    },
    stop: async () => {
      child.stdin.end();
      child.kill();
      await exiting;
      await reading;
    },
  };
}

const diagnosticsChars = 2000;

function formatExit(exitCode: number, diagnostics: string): string {
  const tail = diagnostics.trim().slice(-diagnosticsChars);

  return `codex app-server exited with status ${exitCode}${tail === '' ? '' : `: ${tail}`}`;
}

async function readLines(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');

    buffer = lines.pop() ?? '';
    for (const line of lines.filter((text) => text.trim() !== '')) {
      onLine(line);
    }
  }
}

async function withDeadline<T>(label: string, start: () => Promise<T>): Promise<T> {
  const deadline = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    deadline.reject(new Error(`no ${label} within ${waitMs} ms`));
  }, waitMs);

  return Promise.race([start(), deadline.promise]).finally(() => {
    clearTimeout(timer);
  });
}
