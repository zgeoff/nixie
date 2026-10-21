import { setImmediate } from 'node:timers/promises';
import { z } from 'zod';
import type { TestClock } from './build-test-clock';
import { buildTestClock } from './build-test-clock';
import { harnessEnv } from './harness-env';
import type { FaultPointArm, FaultPointWork, HarnessMessage, NixieMessage } from './types';

export interface HarnessChannel {
  readonly send: (message: NixieMessage) => void;
  readonly subscribe: (onMessage: (message: HarnessMessage) => void) => void;
}

export type HarnessOperation<Args> = (args: Args) => unknown;

export interface HarnessLink {
  readonly clock: TestClock;
  readonly waitAtFaultPoint: (point: string, work: FaultPointWork) => Promise<void>;
  readonly registerOperation: <Args>(
    name: string,
    schema: z.ZodType<Args>,
    operation: HarnessOperation<Args>,
  ) => void;
  readonly sendReady: () => void;
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

const faultPointArmSchema = z.object({
  point: z.string(),
  kind: z.string().exactOptional(),
  workID: z.string().exactOptional(),
  times: z.number().exactOptional(),
}) satisfies z.ZodType<FaultPointArm>;

const advanceArgsSchema = z.object({
  durationMs: z.number(),
  settle: z.boolean().exactOptional(),

  settleTimeoutMs: z.number().exactOptional(),
});

export function startHarnessLink(
  env: Readonly<Record<string, string | undefined>> = process.env,
  channel: HarnessChannel = processChannel,
): HarnessLink {
  const clock = buildTestClock(Number(env[harnessEnv.clockMs] ?? '0'));
  const arms = parseArms(env[harnessEnv.faultPoints]);

  const operations = new Map<string, HarnessOperation<unknown>>();
  const holds = new Map<number, () => void>();

  const arrivals = { next: 1 };

  operations.set('advance', (args) => runAdvance(clock, advanceArgsSchema.parse(args)));
  operations.set('arm', (args) => runArm(arms, faultPointArmSchema.parse(args)));

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
    registerOperation: (name, schema, operation) => {
      operations.set(name, (args) => operation(schema.parse(args)));
    },
    sendReady: () => {
      channel.send({ type: 'ready' });
    },
  };
}

interface HeldArm {
  readonly arm: FaultPointArm;
  readonly held: { remaining: number };
}

function parseArms(text: string | undefined): HeldArm[] {
  const parsed = text === undefined ? [] : z.array(faultPointArmSchema).parse(JSON.parse(text));

  return parsed.map((arm) => buildHeldArm(arm));
}

function buildHeldArm(arm: FaultPointArm): HeldArm {
  return { arm, held: { remaining: arm.times ?? 1 } };
}

const defaultSettleTimeoutMs = 5000;

async function runAdvance(
  clock: TestClock,
  advance: z.infer<typeof advanceArgsSchema>,
): Promise<{ readonly settled: boolean }> {
  const before = clock.countSleepers();

  clock.advance(advance.durationMs);

  if (advance.settle !== true) {
    return { settled: false };
  }

  const deadline = Date.now() + (advance.settleTimeoutMs ?? defaultSettleTimeoutMs);

  while (clock.countSleepers() < before && Date.now() < deadline) {
    await Bun.sleep(5);
  }

  return { settled: clock.countSleepers() >= before };
}

function runArm(arms: HeldArm[], arm: FaultPointArm): null {
  arms.push(buildHeldArm(arm));

  return null;
}

async function runRequest(
  channel: HarnessChannel,
  operations: ReadonlyMap<string, HarnessOperation<unknown>>,
  request: Extract<HarnessMessage, { type: 'request' }>,
): Promise<void> {
  const operation = operations.get(request.operation);

  // Bun emits every message of one IPC read in one task, so a release and a request can share it.
  // The request waits a task, so the code that the release let go reaches its next wait first.
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

function isArmMatch(candidate: HeldArm, point: string, work: FaultPointWork): boolean {
  const arm = candidate.arm;

  return (
    candidate.held.remaining > 0 &&
    arm.point === point &&
    (arm.kind === undefined || arm.kind === work.kind) &&
    (arm.workID === undefined || arm.workID === work.id)
  );
}
