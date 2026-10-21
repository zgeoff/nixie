import { setTimeout } from 'node:timers/promises';
import type { CrashHarness, FaultPointArrival } from '@heynixie/testing';
import type { TestNixie } from './start-test-nixie';
import type { MatchRecord, TestRecord } from './types';
import { waitForMatch } from './wait-for-match';

export interface AdvanceWaits {
  readonly advanceWaitMs: number;

  readonly lastAdvanceWaitMs: number;
}

// A turn runs the real SDK in a guest process, which takes a few seconds on a slow host.
const defaultAdvanceWaits: AdvanceWaits = { advanceWaitMs: 1000, lastAdvanceWaitMs: 30_000 };

export function buildAdvanceHelpers(
  harness: CrashHarness,
  readRecords: TestNixie['readRecords'],
  waits: AdvanceWaits = defaultAdvanceWaits,
): Pick<TestNixie, 'advanceUntilArrival' | 'advanceUntilRecord'> {
  return {
    advanceUntilRecord: (stepMs, maxSteps, matches) =>
      runAdvances(
        {
          harness,
          stepMs,
          waits,
          waitFor: (timeoutMs) => waitForMatchWithin(readRecords, matches, timeoutMs),
        },
        maxSteps,
      ),
    advanceUntilArrival: (nixie, point, options) => {
      const arrival = nixie.waitForArrival(point);

      return runAdvances(
        {
          harness,
          stepMs: options.stepMs,
          waits,
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
  readonly waits: AdvanceWaits;

  readonly waitFor: (timeoutMs: number) => Promise<T | null>;
}

async function runAdvances<T>(advances: Advances<T>, remaining: number): Promise<T> {
  await advances.harness.advance(advances.stepMs);

  const timeoutMs =
    remaining <= 1 ? advances.waits.lastAdvanceWaitMs : advances.waits.advanceWaitMs;

  const found = await advances.waitFor(timeoutMs);

  if (found !== null) {
    return found;
  }

  if (remaining <= 1) {
    throw new Error(`nothing arrived after the last advance of ${advances.stepMs} ms`);
  }

  return runAdvances(advances, remaining - 1);
}

async function waitForMatchWithin(
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
