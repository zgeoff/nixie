import type { GuestFrame, HostFrame, InboxMessage } from '@heynixie/wire';
import { decodeTurnFrame, encodeTurnFrame, hostFrameSchema } from '@heynixie/wire';
import type { ExecStream, StreamExit } from '../types';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

// The guest's side of one turn: the messages the host sent into it, one at a time.
interface StubGuest {
  // aborts when the host stops the guest; a script writes nothing to the disk once it has
  readonly signal?: AbortSignal;

  // rejects with the signal's reason once the guest stops
  readonly waitForMessage: () => Promise<InboxMessage>;

  // the next message that has arrived and nothing has taken, or undefined when none
  readonly takeMessage?: () => InboxMessage | undefined;

  // sends frames before the script ends, as the guest sends each input's result once it completes
  readonly emit?: (frames: readonly GuestFrame[]) => void;
}

// Answers one turn frame with the guest frames the stub sends back before it exits.
export type StubGuestScript = (
  turn: TurnFrame,
  guest: StubGuest,
) => Promise<readonly GuestFrame[]> | readonly GuestFrame[];

// Answers one summarize frame with the guest frames the stub sends back before it exits.
export type StubSummaryScript = (
  frame: SummarizeFrame,
) => Promise<readonly GuestFrame[]> | readonly GuestFrame[];

export interface StubGuestHooks {
  readonly onTurn: StubGuestScript;
  readonly onSummary: StubSummaryScript;
  readonly onPurge: () => Promise<readonly GuestFrame[]> | readonly GuestFrame[];

  // sees every frame the host sends, in order, before the guest answers it
  readonly onFrame?: (frame: HostFrame) => void;
}

const noStderr = { bytes: new Uint8Array(0), totalBytes: 0, isCut: false };

// Starts the stub guest on a framed stream: it answers a turn, summarize or purge frame with its
// script. A stop ends the guest at once, as a kill does, whether or not the script settles, and the
// frames the script sent before the stop stay sent.
export function startStubGuest(hooks: StubGuestHooks): ExecStream {
  const output = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>();

  const writer = output.writable.getWriter();
  const exit = Promise.withResolvers<StreamExit>();

  const stopping = new AbortController();

  const inbox = buildMessageQueue(stopping.signal);

  // the writes so far, in order; a stopped guest queues none
  const sending = { done: Promise.resolve() };

  const emit = (frames: readonly GuestFrame[]) => {
    if (stopping.signal.aborted) {
      return;
    }

    const previous = sending.done;

    sending.done = (async () => {
      await previous;
      await writeFrames(writer, frames);
    })();
  };

  const stopGuest = async (ended: StreamExit) => {
    await sending.done;

    await writer.close().catch(() => {});

    exit.resolve(ended);
  };

  // a script the host stopped sends nothing more, and the stop ends the guest
  const runScript = async (first: Exclude<HostFrame, { type: 'message' }>) => {
    const answer = await tryRunFirstFrame(hooks, first, {
      signal: stopping.signal,
      waitForMessage: inbox.wait,
      takeMessage: inbox.take,
      emit,
    });

    if (stopping.signal.aborted) {
      return;
    }

    emit(answer);

    await stopGuest({ code: 0, signal: null, stderr: noStderr });
  };

  return {
    messages: output.readable,
    send: (bytes) => {
      const frame = decodeTurnFrame(hostFrameSchema, bytes);

      hooks.onFrame?.(frame);

      if (frame.type === 'message') {
        inbox.push(frame.message);
      } else {
        void runScript(frame);
      }

      return Promise.resolve();
    },
    exit: exit.promise,
    stop: async () => {
      stopping.abort(new Error('the host stopped the guest'));

      await stopGuest({ code: null, signal: 'SIGTERM', stderr: noStderr });

      return exit.promise;
    },
  };
}

// a script that throws ends the guest as the real one does: a failed frame, then exit code 0
async function tryRunFirstFrame(
  hooks: StubGuestHooks,
  first: Exclude<HostFrame, { type: 'message' }>,
  guest: StubGuest,
): Promise<readonly GuestFrame[]> {
  try {
    return await runFirstFrame(hooks, first, guest);
  } catch (error) {
    return [{ type: 'failed', reason: 'error', detail: String(error) }];
  }
}

function runFirstFrame(
  hooks: StubGuestHooks,
  first: Exclude<HostFrame, { type: 'message' }>,
  guest: StubGuest,
): Promise<readonly GuestFrame[]> | readonly GuestFrame[] {
  if (first.type === 'purge') {
    return hooks.onPurge();
  }

  if (first.type === 'summarize') {
    return hooks.onSummary(first);
  }

  return hooks.onTurn(first, guest);
}

// the guest's inbox; a wait rejects, with the signal's reason as the cause, once the signal aborts
function buildMessageQueue(signal: AbortSignal): {
  readonly push: (message: InboxMessage) => void;
  readonly wait: () => Promise<InboxMessage>;
  readonly take: () => InboxMessage | undefined;
} {
  const queued: InboxMessage[] = [];
  const waiting: PromiseWithResolvers<InboxMessage>[] = [];

  signal.addEventListener(
    'abort',
    () => {
      for (const waiter of waiting.splice(0)) {
        waiter.reject(buildStoppedError(signal));
      }
    },
    { once: true },
  );

  return {
    push: (message) => {
      const waiter = waiting.shift();

      if (waiter === undefined) {
        queued.push(message);
      } else {
        waiter.resolve(message);
      }
    },
    take: () => queued.shift(),
    wait: () => {
      const message = queued.shift();

      if (message !== undefined) {
        return Promise.resolve(message);
      }

      if (signal.aborted) {
        return Promise.reject(buildStoppedError(signal));
      }

      const next = Promise.withResolvers<InboxMessage>();

      waiting.push(next);

      return next.promise;
    },
  };
}

// a write the host's closed stream refuses is dropped, as the host reads nothing more
async function writeFrames(
  writer: WritableStreamDefaultWriter<Uint8Array<ArrayBuffer>>,
  frames: readonly GuestFrame[],
): Promise<void> {
  for (const frame of frames) {
    await writer.write(encodeTurnFrame(frame)).catch(() => {});
  }
}

function buildStoppedError(signal: AbortSignal): Error {
  return new Error('the stub guest stopped while it waited for a message', {
    cause: signal.reason,
  });
}
