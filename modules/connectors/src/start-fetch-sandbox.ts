// oxlint-disable typescript/prefer-readonly-parameter-types -- the fetch sandbox's own state, and stream handles, which have no readonly form
import type { ExecStream, Sandbox, SandboxAdapter, SandboxLimits } from '@heynixie/sandbox';
import { buildSandboxSpec } from '@heynixie/sandbox';
import type { FetchLimits, FetchReply } from '@heynixie/wire';
import { decodeFetchReply, encodeFetchMessage } from '@heynixie/wire';

export interface FetchSandboxOptions {
  readonly adapter: SandboxAdapter;
  readonly image: string;

  // the fetcher's command in the image
  readonly argv: readonly string[];
  readonly limits: FetchLimits;

  // the ranges the deployment lists as internal, for the fetcher's own address check
  readonly deniedRanges: readonly string[];
  readonly fetchesPerSandbox: number;
  readonly sandboxLimits: SandboxLimits;

  // the time past the fetch's own limit that nixie waits for the reply before it stops the fetcher
  readonly replyGraceMs?: number;

  // the longest nixie waits for the adapter to create, list or destroy a sandbox
  readonly sandboxCallTimeoutMs?: number;
}

export interface FetchSandbox {
  readonly readPage: (url: string) => Promise<FetchReply>;

  // fails every later fetch, waits for the fetch in flight, then destroys the sandbox
  readonly stop: () => Promise<void>;
}

// the owner of every fetch sandbox, which a new sandbox's start reads to remove any left behind
export const fetchSandboxOwner = 'web_fetch';

// Starts the long-lived fetch sandbox, which nixie creates on the first fetch. Each fetch runs one
// at a time in a new fetcher process, over its stdin and stdout and never the sandbox's network.
// A new sandbox replaces it after fetchesPerSandbox fetches, or after a fetch with no page.
export function startFetchSandbox(options: FetchSandboxOptions): FetchSandbox {
  const state: FetchSandboxState = {
    sandbox: null,
    fetches: 0,
    queue: Promise.resolve(),
    isStopped: false,
  };

  return {
    readPage: async (url) => {
      const previous = state.queue;
      const done = Promise.withResolvers<void>();

      state.queue = done.promise;
      try {
        await previous;
        return state.isStopped ? stoppedReply : await runFetch(options, state, url);
      } finally {
        done.resolve();
      }
    },
    stop: async () => {
      state.isStopped = true;
      await state.queue;
      await removeSandbox(options, state);
    },
  };
}

interface FetchSandboxState {
  sandbox: Promise<Sandbox> | null;
  fetches: number;
  queue: Promise<void>;
  isStopped: boolean;
}

const stoppedReply: FetchReply = { kind: 'failed', reason: 'the fetch sandbox is stopped' };

async function runFetch(
  options: FetchSandboxOptions,
  state: FetchSandboxState,
  url: string,
): Promise<FetchReply> {
  const reply = await tryRunFetcher(options, state, url);

  state.fetches += 1;
  if (reply.kind !== 'page' || state.fetches >= options.fetchesPerSandbox) {
    await removeSandbox(options, state);
  }
  return reply;
}

// the reply, or a failure when the sandbox or the fetcher went wrong
async function tryRunFetcher(
  options: FetchSandboxOptions,
  state: FetchSandboxState,
  url: string,
): Promise<FetchReply> {
  try {
    state.sandbox ??= waitOrTimeOut(createFetchSandbox(options), {
      timer: AbortSignal.timeout(options.sandboxCallTimeoutMs ?? defaultSandboxCallTimeoutMs),
      message: sandboxCallTimeoutMessage,
    });

    const sandbox = await state.sandbox;

    return await runFetcher(sandbox, options, url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return { kind: 'failed', reason: `the fetch sandbox failed: ${message}` };
  }
}

// destroys every fetch sandbox a past process left, then creates a new one
async function createFetchSandbox(options: FetchSandboxOptions): Promise<Sandbox> {
  const leftovers = await options.adapter.list(fetchSandboxOwner);

  await Promise.all(leftovers.map((sandbox) => sandbox.destroy()));
  return options.adapter.create(
    buildSandboxSpec({
      kind: 'fetch',
      image: options.image,
      owner: fetchSandboxOwner,
      limits: options.sandboxLimits,
    }),
  );
}

const defaultSandboxCallTimeoutMs = 120_000;
const sandboxCallTimeoutMessage = 'the sandbox call passed its time limit';

// A destroy that fails or never ends leaves the sandbox to the next create, which removes every
// sandbox of the owner, so a failed destroy never stops the next fetch.
async function removeSandbox(
  options: FetchSandboxOptions,
  state: FetchSandboxState,
): Promise<void> {
  const sandbox = state.sandbox;
  const timer = AbortSignal.timeout(options.sandboxCallTimeoutMs ?? defaultSandboxCallTimeoutMs);

  state.sandbox = null;
  state.fetches = 0;
  try {
    const created = await sandbox;

    await waitOrTimeOut(created?.destroy() ?? Promise.resolve(), {
      timer,
      message: sandboxCallTimeoutMessage,
    });
  } catch {
    // a create that failed made nothing to destroy
  }
}

const defaultReplyGraceMs = 5000;
const fetcherTimeoutMessage = 'the fetcher passed its time limit';

// JSON escapes a byte of text as at most 6 bytes, and the rest of a reply fits in 64 KiB
const replyOverheadBytes = 65_536;

async function runFetcher(
  sandbox: Sandbox,
  options: FetchSandboxOptions,
  url: string,
): Promise<FetchReply> {
  const timer = AbortSignal.timeout(
    options.limits.timeoutMs + (options.replyGraceMs ?? defaultReplyGraceMs),
  );
  const stream = await waitOrTimeOut(
    sandbox.spawn({
      argv: options.argv,
      maxMessageBytes: options.limits.textBytes * 6 + replyOverheadBytes,
    }),
    { timer, message: fetcherTimeoutMessage },
  );
  const request = { url, limits: options.limits, deniedRanges: options.deniedRanges };

  try {
    return await sendFetchRequest(stream, encodeFetchMessage(request), timer);
  } catch (error) {
    await stream.stop();
    throw error;
  }
}

// sends the request, then reads the reply and waits for the fetcher to exit by itself
async function sendFetchRequest(
  stream: ExecStream,
  request: Uint8Array,
  timer: AbortSignal,
): Promise<FetchReply> {
  await waitOrTimeOut(stream.send(request), { timer, message: fetcherTimeoutMessage });

  const reply = await waitOrTimeOut(readFirstMessage(stream.messages), {
    timer,
    message: fetcherTimeoutMessage,
  });
  const exit = await waitOrTimeOut(stream.exit, { timer, message: fetcherTimeoutMessage });

  if (exit.code !== 0) {
    throw new Error(`the fetcher exited with ${exit.code ?? exit.signal ?? 'no code'}`);
  }
  if (reply === null) {
    throw new Error('the fetcher closed its output with no reply');
  }
  return decodeFetchReply(reply);
}

// the first message, or null when the fetcher closes its output first
async function readFirstMessage(messages: AsyncIterable<Uint8Array>): Promise<Uint8Array | null> {
  const first = await messages[Symbol.asyncIterator]().next();

  return first.done === true ? null : first.value;
}

interface TimeLimit {
  readonly timer: AbortSignal;
  readonly message: string;
}

async function waitOrTimeOut<T>(promise: Promise<T>, limit: TimeLimit): Promise<T> {
  const timer = limit.timer;
  const timedOut = Promise.withResolvers<never>();
  const onTimeout = () => {
    timedOut.reject(new Error(limit.message));
  };

  if (timer.aborted) {
    throw new Error(limit.message);
  }
  timer.addEventListener('abort', onTimeout, { once: true });
  try {
    return await Promise.race([promise, timedOut.promise]);
  } finally {
    timer.removeEventListener('abort', onTimeout);
  }
}
