import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { ExecStream, Sandbox, SandboxAdapter, SandboxLimits } from '@heynixie/sandbox';
import { buildSandboxSpec } from '@heynixie/sandbox';
import type { FetchLimits, FetchReply } from '@heynixie/wire';
import { decodeFetchReply, encodeFetchMessage, getLinkTargetLimit } from '@heynixie/wire';

export interface FetchSandboxOptions {
  readonly adapter: SandboxAdapter;
  readonly image: string;

  // the fetcher's command in the image
  readonly argv: readonly string[];
  readonly limits: FetchLimits;

  // the ranges the deployment lists as internal, for the fetcher's own address check
  readonly deniedRanges: readonly string[];
  readonly sandboxLimits: SandboxLimits;

  // the time past the fetch's own limit that nixie waits for the reply before it stops the fetcher
  readonly replyGraceMs?: number;

  // the longest nixie waits for the adapter to create, list or destroy a sandbox
  readonly sandboxCallTimeoutMs?: number;

  // the clock whose sleep times every time limit, the system clock by default
  readonly clock?: Clock;
}

export interface FetchSandbox {
  readonly readPage: (url: string) => Promise<FetchReply>;

  // fails every later fetch, then waits for the fetch in flight and the destroy of its sandbox
  readonly stop: () => Promise<void>;
}

interface FetchSandboxState {
  // settles once the last fetch's sandbox is destroyed
  queue: Promise<void>;
  isStopped: boolean;
}

const stoppedReply: FetchReply = { kind: 'failed', reason: 'the fetch sandbox is stopped' };

// Starts the web fetch's sandboxes: each fetch creates a new fetch sandbox, runs one fetcher
// process in it over its stdin and stdout, and destroys it. Fetches run one at a time, and the
// next fetch starts only once the last one's sandbox is destroyed, so no two fetches share a sandbox.
export function startFetchSandbox(options: FetchSandboxOptions): FetchSandbox {
  const state: FetchSandboxState = { queue: Promise.resolve(), isStopped: false };

  return {
    readPage: async (url) => {
      const previous = state.queue;
      const ended = Promise.withResolvers<void>();

      state.queue = ended.promise;

      await previous;

      if (state.isStopped) {
        ended.resolve();

        return stoppedReply;
      }

      return runFetch(options, url, ended.resolve);
    },
    stop: async () => {
      state.isStopped = true;

      await state.queue;
    },
  };
}

// returns the reply as soon as the fetcher sends it, and destroys the sandbox after, off the reply's
// path
async function runFetch(
  options: FetchSandboxOptions,
  url: string,
  onEnded: () => void,
): Promise<FetchReply> {
  const creating = waitOrTimeOut(createFetchSandbox(options), buildSandboxCallLimit(options));

  const reply = await tryRunFetcher(creating, options, url);

  void removeSandbox(options, creating, onEnded);

  return reply;
}

interface TimeLimit {
  readonly clock: Clock;

  // the clock time, in milliseconds since the epoch, that the call must settle by
  readonly deadline: number;
  readonly message: string;
}

async function waitOrTimeOut<T>(promise: Promise<T>, limit: TimeLimit): Promise<T> {
  // a call already settled would win the race below, so a deadline that passed between calls fails
  // here first
  if (limit.deadline <= limit.clock.now()) {
    throw new Error(limit.message);
  }

  const settled = new AbortController();

  try {
    return await Promise.race([promise, waitForDeadline(limit, settled.signal)]);
  } finally {
    // ends the clock's sleep, so a call that settled in time leaves no sleeper behind
    settled.abort();
  }
}

// rejects with the limit's message once the clock reaches its deadline
async function waitForDeadline(limit: TimeLimit, settled: AbortSignal): Promise<never> {
  await limit.clock.sleep(limit.deadline - limit.clock.now(), settled);

  throw new Error(limit.message);
}

// the owner of every fetch sandbox, which a new sandbox's start reads to remove any left behind
export const fetchSandboxOwner = 'web_fetch';

// destroys every fetch sandbox a past process or an earlier fetch left, then creates a new one
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

// the reply, or a failure when the sandbox or the fetcher went wrong
async function tryRunFetcher(
  creating: Promise<Sandbox>,
  options: FetchSandboxOptions,
  url: string,
): Promise<FetchReply> {
  try {
    const sandbox = await creating;

    return await runFetcher(sandbox, options, url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return { kind: 'failed', reason: `the fetch sandbox failed: ${message}` };
  }
}

const defaultReplyGraceMs = 5000;

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
      maxMessageBytes: getReplyLimit(options.limits.textBytes),
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

// the rest of a reply fits in 64 KiB
const replyOverheadBytes = 65_536;

// JSON escapes a byte of text as at most 6 bytes and a byte of a serialized URL as at most 2, and
// each target's quotes and comma take 3 bytes beside a mark of at least 7 bytes in the text
function getReplyLimit(textBytes: number): number {
  return textBytes * 6 + getLinkTargetLimit(textBytes) * 2 + textBytes + replyOverheadBytes;
}

// sends the request, then reads the reply and waits for the fetcher to exit by itself
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

// the first message, or null when the fetcher closes its output first
async function readFirstMessage(messages: AsyncIterable<Uint8Array>): Promise<Uint8Array | null> {
  const first = await messages[Symbol.asyncIterator]().next();

  return first.done === true ? null : first.value;
}

// A destroy that fails or never ends, or a create that finishes after its time limit, leaves the
// sandbox to the next create, which removes every sandbox of the owner first.
async function removeSandbox(
  options: FetchSandboxOptions,
  creating: Promise<Sandbox>,
  onRemoved: () => void,
): Promise<void> {
  const limit = buildSandboxCallLimit(options);

  try {
    const created = await creating;

    await waitOrTimeOut(created.destroy(), limit);
  } catch {
    // a create that failed made nothing to destroy
  } finally {
    onRemoved();
  }
}
