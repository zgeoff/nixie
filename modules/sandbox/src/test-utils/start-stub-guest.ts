import type { GuestFrame, HostFrame, InboxMessage } from '@heynixie/wire';
import { decodeTurnFrame, encodeTurnFrame, hostFrameSchema } from '@heynixie/wire';
import type { ExecStream, StreamExit } from '../types';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

// The guest's side of one turn: the messages the host sent into it, one at a time.
interface StubGuest {
  readonly waitForMessage: () => Promise<InboxMessage>;

  // the next message that has arrived and nothing has taken, or undefined when none
  readonly takeMessage?: () => InboxMessage | undefined;
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

// Starts the stub guest on a framed stream: it answers a turn frame and a summarize frame with their scripts, and a purge frame as the guest does once it
// has removed its session state
export function startStubGuest(hooks: StubGuestHooks): ExecStream {
  const output = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>();

  const writer = output.writable.getWriter();
  const exit = Promise.withResolvers<StreamExit>();
  const inbox = buildMessageQueue();

  const stopGuest = async (ended: StreamExit) => {
    await writer.close().catch(() => {});

    exit.resolve(ended);
  };

  // a script that throws ends the guest as the real one does: a failed frame, then exit code 0
  const runScript = async (first: Exclude<HostFrame, { type: 'message' }>) => {
    try {
      const frames = await runFirstFrame(hooks, first, {
        waitForMessage: inbox.wait,
        takeMessage: inbox.take,
      });

      for (const frame of frames) {
        await writer.write(encodeTurnFrame(frame));
      }
    } catch (error) {
      const failed = { type: 'failed', reason: 'error', detail: String(error) } as const;

      await writer.write(encodeTurnFrame(failed)).catch(() => {});
    }

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
      await stopGuest({ code: null, signal: 'SIGTERM', stderr: noStderr });

      return exit.promise;
    },
  };
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

function buildMessageQueue(): {
  readonly push: (message: InboxMessage) => void;
  readonly wait: () => Promise<InboxMessage>;
  readonly take: () => InboxMessage | undefined;
} {
  const queued: InboxMessage[] = [];
  const waiting: ((message: InboxMessage) => void)[] = [];

  return {
    push: (message) => {
      const waiter = waiting.shift();

      if (waiter === undefined) {
        queued.push(message);
      } else {
        waiter(message);
      }
    },
    take: () => queued.shift(),
    wait: () => {
      const message = queued.shift();

      if (message !== undefined) {
        return Promise.resolve(message);
      }

      const next = Promise.withResolvers<InboxMessage>();

      waiting.push(next.resolve);

      return next.promise;
    },
  };
}
