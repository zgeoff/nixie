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

  // ends the stream the way a crashed server does
  readonly close: (exitCode: number) => void;
}

const encoder = new TextEncoder();

// A stand-in for `codex app-server`, which speaks its JSON-RPC over stdio in memory. It answers
// `initialize` itself, and every other request through `answer`.
export function startFakeAppServer(answer: (request: FakeRequest) => FakeReply): FakeAppServer {
  const requests: FakeRequest[] = [];

  const stdout = new TransformStream<Uint8Array, Uint8Array>();

  const writer = stdout.writable.getWriter();
  const exited = Promise.withResolvers<number>();

  const send = (value: object): void => {
    void writeQuietly(writer, encoder.encode(`${JSON.stringify(value)}\n`));
  };

  const notify = (method: string, params: unknown): void => {
    send({ method, params });
  };

  const handleLine = (line: string): void => {
    const message: unknown = JSON.parse(line);

    if (typeof message !== 'object' || message === null || !('id' in message)) {
      return;
    }

    const method = 'method' in message ? String(message.method) : '';
    const params = 'params' in message ? message.params : null;

    if (method === 'initialize') {
      send({ id: message.id, result: {} });

      return;
    }

    const request = { method, params };

    requests.push(request);

    const reply = answer(request);
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

async function closeQuietly(writer: WritableStreamDefaultWriter<Uint8Array>): Promise<void> {
  try {
    await writer.close();
  } catch {
    // the stream is closed
  }
}
