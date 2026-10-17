import { setImmediate } from 'node:timers/promises';
import type { TestClock } from './build-test-clock';
import { buildTestClock } from './build-test-clock';
import { harnessEnv } from './harness-env';
import type { FaultPointArm, FaultPointWork, HarnessMessage, NixieMessage } from './types';

// The IPC channel to the harness: Bun's process.send and message events in nixie, or a stand-in.
export interface HarnessChannel {
  readonly send: (message: NixieMessage) => void;
  readonly subscribe: (onMessage: (message: HarnessMessage) => void) => void;
}

export type HarnessOperation = (args: unknown) => unknown;

// nixie's half of the crash harness: the one clock, which the harness sets at start and advances,
// the fault point handler, which holds a runner at an armed point until the harness releases it,
// and the operations the harness asks nixie to run, such as writing your message.
export interface HarnessLink {
  readonly clock: TestClock;
  readonly waitAtFaultPoint: (point: string, work: FaultPointWork) => Promise<void>;
  readonly registerOperation: (name: string, operation: HarnessOperation) => void;
  readonly sendReady: () => void;
}

// Starts the link from the clock time and the armed fault points the harness passed in the
// environment. Two operations are built in: advance, which moves the clock and, with settle, waits
// for every sleeper it woke to sleep again, and arm, which holds one more fault point.
export function startHarnessLink(
  env: Readonly<Record<string, string | undefined>> = process.env,
  channel: HarnessChannel = processChannel,
): HarnessLink {
  const clock = buildTestClock(Number(env[harnessEnv.clockMs] ?? '0'));
  const arms = parseArms(env[harnessEnv.faultPoints]);

  const operations = new Map<string, HarnessOperation>();
  const holds = new Map<number, () => void>();

  const arrivals = { next: 1 };

  operations.set('advance', (args) => runAdvance(clock, args));
  operations.set('arm', (args) => runArm(arms, args));

  channel.subscribe((message) => {
    if (message.type === 'release') {
      holds.get(message.arrivalID)?.();
      holds.delete(message.arrivalID);

      return;
    }

    void runRequest(channel, operations, message);
  });

  return {
    clock,
    waitAtFaultPoint: async (point, work) => {
      const arm = arms.find((candidate) => isArmMatch(candidate, point, work));

      if (arm === undefined) {
        return;
      }

      arm.held.remaining -= 1;

      const arrivalID = arrivals.next;
      const hold = Promise.withResolvers<void>();

      arrivals.next += 1;

      holds.set(arrivalID, hold.resolve);
      channel.send({ type: 'arrived', arrivalID, point, work });

      await hold.promise;
    },
    registerOperation: (name, operation) => {
      operations.set(name, operation);
    },
    sendReady: () => {
      channel.send({ type: 'ready' });
    },
  };
}

const processChannel: HarnessChannel = {
  send: (message) => {
    if (process.send === undefined) {
      throw new Error('nixie runs without the crash harness IPC channel');
    }

    process.send(message);
  },
  subscribe: (onMessage) => {
    process.on('message', (message: HarnessMessage) => {
      onMessage(message);
    });
  },
};

// an arm and how many more arrivals it holds
interface HeldArm {
  readonly arm: FaultPointArm;
  readonly held: { remaining: number };
}

function parseArms(text: string | undefined): HeldArm[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the harness wrote the JSON
  const parsed = text === undefined ? [] : (JSON.parse(text) as readonly FaultPointArm[]);

  return parsed.map((arm) => buildHeldArm(arm));
}

function runArm(arms: HeldArm[], args: unknown): null {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the harness sent it
  arms.push(buildHeldArm(args as FaultPointArm));

  return null;
}

function buildHeldArm(arm: FaultPointArm): HeldArm {
  return { arm, held: { remaining: arm.times ?? 1 } };
}

function isArmMatch(candidate: HeldArm, point: string, work: FaultPointWork): boolean {
  const arm = candidate.arm;

  return (
    candidate.held.remaining > 0 &&
    arm.point === point &&
    (arm.kind === undefined || arm.kind === work.kind) &&
    (arm.workID === undefined || arm.workID === work.id)
  );
}

interface AdvanceArgs {
  readonly ms: number;
  readonly settle?: boolean;

  // how long an advance waits for the sleepers it woke to sleep again
  readonly settleTimeoutMs?: number;
}

const defaultSettleTimeoutMs = 5000;

async function runAdvance(clock: TestClock, args: unknown): Promise<{ readonly settled: boolean }> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the harness sent it
  const advance = args as AdvanceArgs;
  const before = clock.countSleepers();

  clock.advance(advance.ms);

  if (advance.settle !== true) {
    return { settled: false };
  }

  const deadline = Date.now() + (advance.settleTimeoutMs ?? defaultSettleTimeoutMs);

  while (clock.countSleepers() < before && Date.now() < deadline) {
    await Bun.sleep(5);
  }

  return { settled: clock.countSleepers() >= before };
}

async function runRequest(
  channel: HarnessChannel,
  operations: ReadonlyMap<string, HarnessOperation>,
  request: Extract<HarnessMessage, { type: 'request' }>,
): Promise<void> {
  const operation = operations.get(request.operation);

  // A release and a request can arrive in one read, whose messages Bun emits in one task. The
  // request waits a task, so the code a release let go, such as a graceful stop that starts its
  // grace sleep, runs to its next wait before an advance moves the clock.
  await setImmediate();

  try {
    if (operation === undefined) {
      throw new Error(`nixie has no harness operation ${request.operation}`);
    }

    const result: unknown = await operation(request.args);

    channel.send({ type: 'reply', requestID: request.requestID, result: result ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    channel.send({ type: 'reply', requestID: request.requestID, error: message });
  }
}
