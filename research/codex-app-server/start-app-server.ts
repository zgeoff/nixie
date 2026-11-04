import { z } from 'zod';

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
}

const waitMs = 180_000;

const message = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});

// Starts `codex app-server` on stdio and speaks its JSON-RPC: one JSON message per line.
export function startAppServer(env: Record<string, string>, cwd: string): AppServer {
  const log: unknown[] = [];
  const pending = new Map<number, PromiseWithResolvers<unknown>>();
  const waiters = new Set<Waiter>();
  const notifications: LoggedNotification[] = [];
  const child = Bun.spawn(['codex', 'app-server', '--strict-config'], {
    cwd,
    env,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'ignore',
  });
  let nextID = 1;

  function send(value: object): void {
    log.push({ from: 'client', ...value });
    child.stdin.write(`${JSON.stringify(value)}\n`);
  }

  function handleMessage(line: string): void {
    const raw: unknown = JSON.parse(line);
    const parsed = message.parse(raw);

    log.push({ from: 'server', ...message.passthrough().parse(raw) });
    if (parsed.method && parsed.id !== undefined) {
      // a server request, such as an approval; the spike approves nothing
      send({ id: parsed.id, error: { code: -32601, message: 'the spike answers no server request' } });
      return;
    }
    if (parsed.method) {
      const notification = { method: parsed.method, params: parsed.params };

      notifications.push({ position: log.length - 1, notification });
      for (const waiter of waiters) {
        if (waiter.method === notification.method && waiter.test(notification.params)) {
          waiters.delete(waiter);
          waiter.resolve(notification);
        }
      }
      return;
    }
    const call = typeof parsed.id === 'number' ? pending.get(parsed.id) : undefined;

    if (call) {
      pending.delete(Number(parsed.id));
      if (parsed.error) {
        call.reject(new Error(JSON.stringify(parsed.error)));
      } else {
        call.resolve(parsed.result);
      }
    }
  }

  const reading = readLines(child.stdout, handleMessage);

  return {
    log,
    request: async (method, params) => {
      const id = nextID;
      const call = Promise.withResolvers<unknown>();

      nextID += 1;
      pending.set(id, call);
      send({ id, method, params });
      return withDeadline(call.promise, `${method} response`);
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
      const found = Promise.withResolvers<Notification>();
      const waiter = { method, test, resolve: found.resolve };

      waiters.add(waiter);
      return withDeadline(found.promise, method).finally(() => {
        waiters.delete(waiter);
      });
    },
    stop: async () => {
      child.stdin.end();
      child.kill();
      await child.exited;
      await reading;
    },
  };
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

async function withDeadline<T>(promise: Promise<T>, label: string): Promise<T> {
  const deadline = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    deadline.reject(new Error(`no ${label} within ${waitMs} ms`));
  }, waitMs);

  return Promise.race([promise, deadline.promise]).finally(() => {
    clearTimeout(timer);
  });
}
