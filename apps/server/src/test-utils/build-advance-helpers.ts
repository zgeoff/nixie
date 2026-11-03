import type { CrashHarness, FaultPointArrival } from '@heynixie/testing';
import { waitForCondition } from '@heynixie/testing';
import type { SpawnedNixie } from './start-spawned-nixie';
import type { MatchRecord, TestRecord } from './types';

export function buildAdvanceHelpers(
  harness: Pick<CrashHarness, 'advance'>,
  readRecords: SpawnedNixie['readRecords'],
): Pick<SpawnedNixie, 'advanceUntilArrival' | 'advanceUntilRecord'> {
  return {
    advanceUntilRecord: (stepMs, maxSteps, matches) =>
      runAdvances(
        { harness, stepMs, read: () => readMatchingRecord(readRecords, matches) },
        maxSteps,
      ),
    advanceUntilArrival: (nixie, point, options) => {
      const arrival = nixie.waitForArrival(point);

      return runAdvances(
        { harness, stepMs: options.stepMs, read: () => readSettledArrival(arrival) },
        options.maxSteps,
      );
    },
  };
}

interface Advances<T> {
  readonly harness: Pick<CrashHarness, 'advance'>;
  readonly stepMs: number;

  readonly read: () => Promise<T | null>;
}

async function runAdvances<T>(advances: Advances<T>, remaining: number): Promise<T> {
  const found = await runAdvance(advances);

  if (found !== null) {
    return found;
  }

  if (remaining <= 1) {
    throw new Error(`nothing arrived after the last advance of ${advances.stepMs} ms`);
  }

  return runAdvances(advances, remaining - 1);
}

async function runAdvance<T>(advances: Advances<T>): Promise<T | null> {
  const failure = runSettledAdvance(advances);
  const found: { value: T | null } = { value: null };

  // A runner that waits on a reply the test holds back, such as a gated provider call, never
  // settles, so what the advance brings ends the wait too. The advance itself always ends: nixie
  // replies by its settle deadline, and a nixie that dies rejects the request.
  await waitForCondition(
    async () => {
      const ended = Bun.peek.status(failure) !== 'pending';

      found.value = await advances.read();

      return found.value !== null || ended;
    },
    { timeoutMs: Number.POSITIVE_INFINITY },
  );

  const settleFailure = found.value === null ? await failure : null;

  if (settleFailure !== null) {
    throw settleFailure;
  }

  return found.value;
}

// A turn runs the real SDK in a guest process, which takes a few seconds on a slow host, and the
// settle ends inside the e2e lane's 15 s limit per test, so a turn that never ends fails on its own.
const settleTimeoutMs = 10_000;

async function runSettledAdvance<T>(advances: Advances<T>): Promise<unknown> {
  try {
    await advances.harness.advance(advances.stepMs, { settle: true, settleTimeoutMs });

    return null;
  } catch (error) {
    return error;
  }
}

async function readMatchingRecord(
  readRecords: SpawnedNixie['readRecords'],
  matches: MatchRecord,
): Promise<TestRecord | null> {
  const records = await readRecords();

  return records.find((record) => matches(record)) ?? null;
}

// nixie sends an arrival before the settled reply, on the same channel, so a read after the reply
// sees it.
function readSettledArrival(
  arrival: Promise<FaultPointArrival>,
): Promise<FaultPointArrival | null> {
  return Promise.race([arrival, Promise.resolve(null)]);
}
