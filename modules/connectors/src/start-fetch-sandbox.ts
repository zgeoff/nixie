import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { ExecStream, Sandbox, SandboxAdapter, SandboxLimits } from '@heynixie/sandbox';
import { buildSandboxSpec } from '@heynixie/sandbox';
import type { FetchLimits, FetchReply } from '@heynixie/wire';
import { decodeFetchReply, encodeFetchMessage, getLinkTargetLimit } from '@heynixie/wire';

export interface FetchSandboxOptions {
  readonly adapter: SandboxAdapter;
  readonly image: string;

  readonly argv: readonly string[];
  readonly limits: FetchLimits;

  readonly deniedRanges: readonly string[];
  readonly sandboxLimits: SandboxLimits;

  // a second fetch sandbox in one process takes an owner of its own, because each one's sweep
  // removes every sandbox of its owner, which would end the other's fetch
  readonly owner?: string;

  readonly replyGraceMs?: number;

  readonly sandboxCallTimeoutMs?: number;

  readonly clock?: Clock;
}

export interface FetchSandbox {
  readonly readPage: (url: string) => Promise<FetchReply>;

  readonly stop: () => Promise<void>;
}

interface FetchSandboxState {
  queue: Promise<void>;
  isStopped: boolean;

  // true until a sweep removes the fetch sandboxes a past process or a failed destroy left
  needsSweep: boolean;
}

const stoppedReply: FetchReply = { kind: 'failed', reason: 'the fetch sandbox is stopped' };

export function startFetchSandbox(options: FetchSandboxOptions): FetchSandbox {
  const state: FetchSandboxState = { queue: Promise.resolve(), isStopped: false, needsSweep: true };

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

      return runFetch(options, state, url, ended.resolve);
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
  state: FetchSandboxState,
  url: string,
  onEnded: () => void,
): Promise<FetchReply> {
  const creating = createWithinLimit(options, state);

  const reply = await tryRunFetcher(creating, options, url);

  void removeSandbox(options, state, creating, onEnded);

  return reply;
}

// A create that passes its time limit stops before its next adapter call, and a sandbox it still
// makes is destroyed as soon as it arrives, so a slow create never leaves one beside a later fetch.
async function createWithinLimit(
  options: FetchSandboxOptions,
  state: FetchSandboxState,
): Promise<Sandbox> {
  const late = new AbortController();

  const created = createFetchSandbox(options, state, late.signal);

  try {
    return await waitOrTimeOut(created, buildSandboxCallLimit(options));
  } catch (error) {
    late.abort();
    void removeLateSandbox(options, state, created);
    throw error;
  }
}

// the owner of every fetch sandbox, which a new sandbox's start reads to remove any left behind
export const fetchSandboxOwner = 'web_fetch';

// destroys every fetch sandbox a past process, a failed create or a failed destroy left, when a sweep
// is due, then creates a new one
async function createFetchSandbox(
  options: FetchSandboxOptions,
  state: FetchSandboxState,
  late: AbortSignal,
): Promise<Sandbox> {
  if (state.needsSweep) {
    const leftovers = await options.adapter.list(options.owner ?? fetchSandboxOwner);

    late.throwIfAborted();

    await Promise.all(leftovers.map((sandbox) => sandbox.destroy()));

    late.throwIfAborted();

    state.needsSweep = false;
  }

  try {
    return await options.adapter.create(
      buildSandboxSpec({
        kind: 'fetch',
        image: options.image,
        owner: options.owner ?? fetchSandboxOwner,
        limits: options.sandboxLimits,
      }),
    );
  } catch (error) {
    // an adapter that fails a create after its runtime made the sandbox can fail to remove it too
    state.needsSweep = true;
    throw error;
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

const defaultSandboxCallTimeoutMs = 120_000;

function buildSandboxCallLimit(options: FetchSandboxOptions): TimeLimit {
  const clock = options.clock ?? systemClock;

  return {
    clock,
    deadline: clock.now() + (options.sandboxCallTimeoutMs ?? defaultSandboxCallTimeoutMs),
    message: 'the sandbox call passed its time limit',
  };
}

// destroys the sandbox a create made after its time limit, once it arrives
async function removeLateSandbox(
  options: FetchSandboxOptions,
  state: FetchSandboxState,
  created: Promise<Sandbox>,
): Promise<void> {
  try {
    const sandbox = await created;

    await destroyOrSweepLater(options, state, sandbox);
  } catch {
    // a create that failed or stopped at its time limit made nothing to destroy
  }
}

// a destroy that fails or never ends leaves the sandbox to a sweep before the next create
async function destroyOrSweepLater(
  options: FetchSandboxOptions,
  state: FetchSandboxState,
  sandbox: Sandbox,
): Promise<void> {
  try {
    await waitOrTimeOut(sandbox.destroy(), buildSandboxCallLimit(options));
  } catch {
    state.needsSweep = true;
  }
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
  creating: Promise<Sandbox>,
  onRemoved: () => void,
): Promise<void> {
  try {
    const created = await creating;

    await destroyOrSweepLater(options, state, created);
  } catch {
    // a create that failed made nothing to destroy, and one that passed its limit removes its own
  } finally {
    onRemoved();
  }
}
