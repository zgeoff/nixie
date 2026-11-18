import { parseJSONOrNull } from '@heynixie/wire';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { parseServerMessage } from './parse-server-message';

// A running `codex app-server`, which speaks JSON-RPC on stdio: one JSON message per line.
export interface AppServerProcess {
  readonly stdin: { readonly write: (text: string) => unknown; readonly end: () => unknown };
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  readonly kill: () => void;
}

interface ClosedEvent {
  readonly kind: 'closed';
  readonly detail: string;
}

type AppServerEvent =
  | { readonly kind: 'notification'; readonly method: string; readonly params: unknown }
  | ClosedEvent;

export interface AppServerClient {
  readonly request: (method: string, params: unknown) => Promise<unknown>;
  readonly notify: (method: string) => void;

  // The next notification in the order the server sent it, or the close of the stream, which
  // every later call repeats.
  readonly nextEvent: () => Promise<AppServerEvent>;
  readonly stop: () => Promise<void>;
}

// A JSON-RPC error that the server answered a request with.
export class AppServerRequestError extends Error {
  override readonly name = 'AppServerRequestError';

  readonly method: string;

  constructor(method: string, detail: string) {
    super(`the app-server refused ${method}: ${detail}`);

    this.method = method;
  }
}

// What the CLI asks the client for when it wants a ChatGPT token: the same 3 fields that
// `account/login/start` takes.
export interface ChatGPTTokens {
  readonly accessToken: string;
  readonly chatgptAccountId: string;
  readonly chatgptPlanType: string;
}

// Opens a client on `child` and runs the `initialize` handshake. On a plan login, `readTokens` gives
// the answer to each token refresh the CLI asks for; with null the client answers no server request.
export async function startAppServer(
  child: AppServerProcess,
  readTokens: (() => ChatGPTTokens) | null,
): Promise<AppServerClient> {
  const client = openClient(child, readTokens);

  try {
    await client.request('initialize', {
      clientInfo: { name: 'nixie-codex-guest', title: null, version: '0.0.0' },
      capabilities: { experimentalApi: false, requestAttestation: false },
    });
  } catch (error) {
    await client.stop();

    throw error;
  }

  client.notify('initialized');

  return client;
}

// How long a process may outlive its closed output before the client gives up on it. A crash ends
// the output just before the exit, and the exit status then names the cause.
const exitGraceMs = 500;
const tokenRefreshMethod = 'account/chatgptAuthTokens/refresh';

function openClient(
  child: AppServerProcess,
  readTokens: (() => ChatGPTTokens) | null,
): AppServerClient {
  const pending = new Map<number, PromiseWithResolvers<unknown>>();

  const queue: AppServerEvent[] = [];
  const waiters: PromiseWithResolvers<AppServerEvent>[] = [];
  const state: { closed: ClosedEvent | null; nextID: number } = { closed: null, nextID: 1 };

  const send = (value: object): void => {
    child.stdin.write(`${JSON.stringify(value)}\n`);
  };

  const push = (event: AppServerEvent): void => {
    const waiter = waiters.shift();

    if (waiter === undefined) {
      queue.push(event);
    } else {
      waiter.resolve(event);
    }
  };

  const close = (detail: string): void => {
    if (state.closed !== null) {
      return;
    }

    const closed: ClosedEvent = { kind: 'closed', detail };

    state.closed = closed;

    for (const call of pending.values()) {
      call.reject(new Error(detail));
    }

    pending.clear();

    for (const waiter of waiters.splice(0)) {
      waiter.resolve(closed);
    }
  };

  const handleLine = (line: string): void => {
    match(parseServerMessage(parseJSONOrNull(line)))
      .with({ kind: 'request' }, (request) => {
        if (request.method === tokenRefreshMethod && readTokens !== null) {
          send({ id: request.id, result: readTokens() });

          return;
        }

        send({
          id: request.id,
          error: { code: -32_601, message: 'the nixie guest answers no server request' },
        });
      })
      .with({ kind: 'notification' }, (notification) => {
        push({
          kind: 'notification',
          method: notification.method,
          params: notification.params,
        });
      })
      .with({ kind: 'result' }, (reply) => {
        pending.get(reply.id)?.resolve(reply.result);
        pending.delete(reply.id);
      })
      .with({ kind: 'error' }, (reply) => {
        pending.get(reply.id)?.reject(new Error(formatRPCError(reply.error)));
        pending.delete(reply.id);
      })
      .with({ kind: 'unmatched' }, () => {})
      .exhaustive();
  };

  const diagnostics = readDiagnostics(child.stderr);

  const reading = readLines(child.stdout, handleLine, close, async () => {
    const exitCode = await Promise.race([child.exited, Bun.sleep(exitGraceMs).then(() => null)]);

    if (exitCode === null) {
      close('codex app-server closed its output and kept running');
    }
  });

  const exiting = waitForExit(child.exited, { reading, diagnostics, close });

  return {
    request: async (method, params) => {
      if (state.closed !== null) {
        throw new Error(state.closed.detail);
      }

      const id = state.nextID;
      const call = Promise.withResolvers<unknown>();

      state.nextID += 1;

      pending.set(id, call);

      send({ id, method, params });

      try {
        return await call.promise;
      } catch (error) {
        throw error instanceof Error && state.closed === null
          ? new AppServerRequestError(method, error.message)
          : error;
      }
    },
    notify: (method) => {
      send({ method });
    },
    nextEvent: () => {
      const queued = queue.shift();

      if (queued !== undefined) {
        return Promise.resolve(queued);
      }

      if (state.closed !== null) {
        return Promise.resolve(state.closed);
      }

      const waiter = Promise.withResolvers<AppServerEvent>();

      waiters.push(waiter);

      return waiter.promise;
    },
    stop: async () => {
      child.stdin.end();
      child.kill();

      await exiting;
    },
  };
}

const rpcErrorSchema = z.object({ message: z.string() });

function formatRPCError(error: unknown): string {
  const parsed = rpcErrorSchema.safeParse(error);

  return parsed.success ? parsed.data.message : JSON.stringify(error);
}

async function readDiagnostics(stderr: ReadableStream<Uint8Array>): Promise<string> {
  try {
    return await new Response(stderr).text();
  } catch (error) {
    return `stderr could not be read: ${String(error)}`;
  }
}

async function readLines(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
  onFailure: (detail: string) => void,
  onEnd: () => Promise<void>,
): Promise<void> {
  const decoder = new TextDecoder();

  let buffer = '';

  try {
    for await (const chunk of stream) {
      buffer += decoder.decode(chunk, { stream: true });

      const lines = buffer.split('\n');

      buffer = lines.pop() ?? '';

      for (const line of lines.filter((text) => text.trim() !== '')) {
        onLine(line);
      }
    }
  } catch (error) {
    onFailure(`the app-server stream failed: ${String(error)}`);

    return;
  }

  await onEnd();
}

const diagnosticsChars = 2000;

interface ExitWatch {
  readonly reading: Promise<void>;
  readonly diagnostics: Promise<string>;
  readonly close: (detail: string) => void;
}

async function waitForExit(exited: Promise<number>, watch: ExitWatch): Promise<void> {
  const exitCode = await exited;

  await watch.reading;

  const diagnostics = await watch.diagnostics;

  const tail = diagnostics.trim().slice(-diagnosticsChars);

  watch.close(`codex app-server exited with status ${exitCode}${tail === '' ? '' : `: ${tail}`}`);
}
