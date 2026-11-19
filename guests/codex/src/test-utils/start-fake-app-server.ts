import type { AppServerProcess } from '../app-server/start-app-server';

export interface FakeRequest {
  readonly method: string;
  readonly params: unknown;
}

export interface FakeNotification {
  readonly method: string;
  readonly params: unknown;
}

// What the fake answers a request with: a result, or an error message, and the notifications that
// follow the answer.
export interface FakeReply {
  readonly result?: unknown;
  readonly error?: string;
  readonly after?: readonly FakeNotification[];
}

export interface FakeAppServer {
  readonly process: AppServerProcess;
  readonly requests: readonly FakeRequest[];

  readonly notify: (method: string, params: unknown) => void;

  // sends the guest a request, as the CLI does for a token refresh, and gives its answer
  readonly request: (method: string, params: unknown) => Promise<unknown>;

  // ends the stream the way a crashed server does
  readonly close: (exitCode: number) => void;
}

const encoder = new TextEncoder();

// A stand-in for `codex app-server`, which speaks its JSON-RPC over stdio in memory. It answers
// `initialize` itself, refuses a token login without the experimental API as the real server does,
// and answers every other request through `answer`.
export function startFakeAppServer(answer: (request: FakeRequest) => FakeReply): FakeAppServer {
  const requests: FakeRequest[] = [];
  const handshake = { experimentalApi: false };

  const stdout = new TransformStream<Uint8Array, Uint8Array>();

  const writer = stdout.writable.getWriter();
  const exited = Promise.withResolvers<number>();

  const send = (value: object): void => {
    void writeQuietly(writer, encoder.encode(`${JSON.stringify(value)}\n`));
  };

  const notify = (method: string, params: unknown): void => {
    send({ method, params });
  };

  const asks = new Map<string, PromiseWithResolvers<unknown>>();

  const state = { nextAsk: 1 };

  const ask = (method: string, params: unknown): Promise<unknown> => {
    const id = `fake-${String(state.nextAsk)}`;
    const pending = Promise.withResolvers<unknown>();

    state.nextAsk += 1;

    asks.set(id, pending);

    send({ id, method, params });

    return pending.promise;
  };

  const handleLine = (line: string): void => {
    const message: unknown = JSON.parse(line);

    if (typeof message !== 'object' || message === null || !('id' in message)) {
      return;
    }

    if (!('method' in message)) {
      // the guest's answer to a request the fake sent
      const answered = 'result' in message ? message.result : message;

      asks.get(String(message.id))?.resolve(answered);

      return;
    }

    const method = String(message.method);
    const params = 'params' in message ? message.params : null;

    if (method === 'initialize') {
      handshake.experimentalApi = hasExperimentalApi(params);

      send({ id: message.id, result: {} });

      return;
    }

    const request = { method, params };

    requests.push(request);

    const reply =
      isTokenLogin(request) && !handshake.experimentalApi
        ? { error: `${method}.chatgptAuthTokens requires experimentalApi capability` }
        : answer(request);

    const failure = { code: -32_603, message: reply.error };

    const answerBody =
      reply.error === undefined
        ? { id: message.id, result: reply.result ?? {} }
        : { id: message.id, error: failure };

    send(answerBody);

    for (const notification of reply.after ?? []) {
      notify(notification.method, notification.params);
    }
  };

  return {
    process: {
      stdin: {
        write: (text) => {
          for (const line of text.split('\n').filter((entry) => entry.trim() !== '')) {
            handleLine(line);
          }
        },
        end: () => {},
      },
      stdout: stdout.readable,
      stderr: new Response('').body ?? new ReadableStream<Uint8Array>(),
      exited: exited.promise,
      kill: () => {
        exited.resolve(143);
        void closeQuietly(writer);
      },
    },
    requests,
    notify,
    request: ask,
    close: (exitCode) => {
      exited.resolve(exitCode);
      void closeQuietly(writer);
    },
  };
}

// The test may end the stream first, so a write or close that finds it closed is no failure.
async function writeQuietly(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  bytes: Uint8Array,
): Promise<void> {
  try {
    await writer.write(bytes);
  } catch {
    // the stream is closed
  }
}

function hasExperimentalApi(params: unknown): boolean {
  if (typeof params !== 'object' || params === null || !('capabilities' in params)) {
    return false;
  }

  return (
    typeof params.capabilities === 'object' &&
    params.capabilities !== null &&
    'experimentalApi' in params.capabilities &&
    params.capabilities.experimentalApi === true
  );
}

function isTokenLogin(request: FakeRequest): boolean {
  return (
    request.method === 'account/login/start' &&
    typeof request.params === 'object' &&
    request.params !== null &&
    'type' in request.params &&
    request.params.type === 'chatgptAuthTokens'
  );
}

async function closeQuietly(writer: WritableStreamDefaultWriter<Uint8Array>): Promise<void> {
  try {
    await writer.close();
  } catch {
    // the stream is closed
  }
}
