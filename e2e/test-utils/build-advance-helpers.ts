import { setTimeout } from 'node:timers/promises';
import type { CrashHarness, FaultPointArrival } from '../../libs/testing/src/index';
import type { TestNixie } from './start-test-nixie';
import type { MatchRecord, TestRecord } from './types';
import { waitForMatch } from './wait-for-match';

// Builds the helpers that advance the clock until a record or an arrival shows, for a wait inside
// nixie, such as a turn's wait for an action, that may start its sleep after the first advance.
export function buildAdvanceHelpers(
  harness: CrashHarness,
  readRecords: TestNixie['readRecords'],
): Pick<TestNixie, 'advanceUntilArrival' | 'advanceUntilRecord'> {
  return {
    advanceUntilRecord: (stepMs, maxSteps, matches) =>
      runAdvances(
        {
          harness,
          stepMs,
          waitFor: (timeoutMs) => findMatchWithin(readRecords, matches, timeoutMs),
        },
        maxSteps,
      ),
    advanceUntilArrival: (nixie, point, options) => {
      const arrival = nixie.waitForArrival(point);

      return runAdvances(
        {
          harness,
          stepMs: options.stepMs,
          waitFor: (timeoutMs) => waitForArrivalWithin(arrival, timeoutMs),
        },
        options.maxSteps,
      );
    },
  };
}

interface Advances<T> {
  readonly harness: CrashHarness;
  readonly stepMs: number;

  // the awaited value once it arrives within timeoutMs, or null
  readonly waitFor: (timeoutMs: number) => Promise<T | null>;
}

async function runAdvances<T>(advances: Advances<T>, remaining: number): Promise<T> {
  await advances.harness.advance(advances.stepMs);

  // the last advance waits as long as any record wait, for a turn on a slow host
  const timeoutMs = remaining <= 1 ? lastAdvanceWaitMs : advanceWaitMs;
  const found = await advances.waitFor(timeoutMs);

  if (found !== null) {
    return found;
  }
  if (remaining <= 1) {
    throw new Error(`nothing arrived after the last advance of ${advances.stepMs} ms`);
  }
  return runAdvances(advances, remaining - 1);
}

async function findMatchWithin(
  readRecords: TestNixie['readRecords'],
  matches: MatchRecord,
  timeoutMs: number,
): Promise<TestRecord | null> {
  const found = await waitForMatch(readRecords, matches, timeoutMs).catch(() => null);

  return found;
}

function waitForArrivalWithin(
  arrival: Promise<FaultPointArrival>,
  timeoutMs: number,
): Promise<FaultPointArrival | null> {
  return Promise.race([arrival, setTimeout(timeoutMs, null)]);
}

// how long each advance but the last waits for its record before the next advance
const advanceWaitMs = 1000;

// a turn runs the real SDK in a guest process, which takes a few seconds on a slow host
const lastAdvanceWaitMs = 30_000;
