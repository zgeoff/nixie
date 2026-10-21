import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { ExecStream, Sandbox, SandboxAdapter, SandboxLimits } from '@heynixie/sandbox';
import { buildSandboxSpec } from '@heynixie/sandbox';
import type { FetchLimits, FetchReply } from '@heynixie/wire';
import { decodeFetchReply, encodeFetchMessage } from '@heynixie/wire';

export interface FetchSandboxOptions {
  readonly adapter: SandboxAdapter;
  readonly image: string;

  readonly argv: readonly string[];
  readonly limits: FetchLimits;

  readonly deniedRanges: readonly string[];
  readonly fetchesPerSandbox: number;
  readonly sandboxLimits: SandboxLimits;

  readonly replyGraceMs?: number;

  readonly sandboxCallTimeoutMs?: number;

  readonly clock?: Clock;
}

export interface FetchSandbox {
  readonly readPage: (url: string) => Promise<FetchReply>;

  readonly stop: () => Promise<void>;
}

interface FetchSandboxState {
  sandbox: Promise<Sandbox> | null;
  fetches: number;
  queue: Promise<void>;
  isStopped: boolean;
}

const stoppedReply: FetchReply = { kind: 'failed', reason: 'the fetch sandbox is stopped' };

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

async function tryRunFetcher(
  options: FetchSandboxOptions,
  state: FetchSandboxState,
  url: string,
): Promise<FetchReply> {
  try {
    state.sandbox ??= waitOrTimeOut(createFetchSandbox(options), buildSandboxCallLimit(options));

    const sandbox = await state.sandbox;

    return await runFetcher(sandbox, options, url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return { kind: 'failed', reason: `the fetch sandbox failed: ${message}` };
  }
}

interface TimeLimit {
  readonly clock: Clock;

  readonly deadline: number;
  readonly message: string;
}

async function waitOrTimeOut<T>(promise: Promise<T>, limit: TimeLimit): Promise<T> {
  // Promise.race takes the first settled input in order, so an already settled call would beat a
  // deadline that passed between calls.
  if (limit.deadline <= limit.clock.now()) {
    throw new Error(limit.message);
  }

  const settled = new AbortController();

  try {
    return await Promise.race([promise, waitForDeadline(limit, settled.signal)]);
  } finally {
    settled.abort();
  }
}

async function waitForDeadline(limit: TimeLimit, settled: AbortSignal): Promise<never> {
  await limit.clock.sleep(limit.deadline - limit.clock.now(), settled);

  throw new Error(limit.message);
}

export const fetchSandboxOwner = 'web_fetch';

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

function buildSandboxCallLimit(options: FetchSandboxOptions): TimeLimit {
  const clock = options.clock ?? systemClock;

  return {
    clock,
    deadline: clock.now() + (options.sandboxCallTimeoutMs ?? defaultSandboxCallTimeoutMs),
    message: 'the sandbox call passed its time limit',
  };
}

const defaultReplyGraceMs = 5000;

// JSON escapes a byte of text as at most 6 bytes, and the rest of a reply fits in 64 KiB.
const replyOverheadBytes = 65_536;

async function runFetcher(
  sandbox: Sandbox,
  options: FetchSandboxOptions,
  url: string,
): Promise<FetchReply> {
  const clock = options.clock ?? systemClock;

  const limit = {
    clock,
    deadline:
      clock.now() + options.limits.timeoutMs + (options.replyGraceMs ?? defaultReplyGraceMs),
    message: 'the fetcher passed its time limit',
  };

  const stream = await waitOrTimeOut(
    sandbox.spawn({
      argv: options.argv,
      maxMessageBytes: options.limits.textBytes * 6 + replyOverheadBytes,
    }),
    limit,
  );

  const request = { url, limits: options.limits, deniedRanges: options.deniedRanges };

  try {
    return await sendFetchRequest(stream, encodeFetchMessage(request), limit);
  } catch (error) {
    await stream.stop();

    throw error;
  }
}

async function sendFetchRequest(
  stream: ExecStream,
  request: Uint8Array,
  limit: TimeLimit,
): Promise<FetchReply> {
  await waitOrTimeOut(stream.send(request), limit);

  const reply = await waitOrTimeOut(readFirstMessage(stream.messages), limit);
  const exit = await waitOrTimeOut(stream.exit, limit);

  if (exit.code !== 0) {
    throw new Error(`the fetcher exited with ${exit.code ?? exit.signal ?? 'no code'}`);
  }

  if (reply === null) {
    throw new Error('the fetcher closed its output with no reply');
  }

  return decodeFetchReply(reply);
}

async function readFirstMessage(messages: AsyncIterable<Uint8Array>): Promise<Uint8Array | null> {
  const first = await messages[Symbol.asyncIterator]().next();

  return first.done === true ? null : first.value;
}

async function removeSandbox(
  options: FetchSandboxOptions,
  state: FetchSandboxState,
): Promise<void> {
  const sandbox = state.sandbox;
  const limit = buildSandboxCallLimit(options);

  state.sandbox = null;
  state.fetches = 0;

  try {
    const created = await sandbox;

    await waitOrTimeOut(created?.destroy() ?? Promise.resolve(), limit);
  } catch {}
}
