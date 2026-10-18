import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { HealthReport, PartCheck, PartReport } from './types';

// Runs every part's check at once and reports each part, with a check that throws or outlasts
// timeoutMs on the clock reported unready, so one stuck part never stalls the endpoint.
export async function checkParts(
  checks: Readonly<Record<string, PartCheck>>,
  timeoutMs: number,
  clock: Clock = systemClock,
): Promise<HealthReport> {
  const entries = await Promise.all(
    Object.entries(checks).map(
      async ([part, check]) => [part, await runCheck(check, timeoutMs, clock)] as const,
    ),
  );

  const parts = Object.fromEntries(entries);

  return {
    status: entries.every(([, report]) => report.isReady) ? 'ready' : 'unready',
    parts,
  };
}

async function runCheck(check: PartCheck, timeoutMs: number, clock: Clock): Promise<PartReport> {
  const stopped = new AbortController();

  try {
    return await Promise.race([
      check(stopped.signal),
      waitForTimeout(clock, timeoutMs, stopped.signal),
    ]);
  } catch (error) {
    return { isReady: false, reason: `the check failed: ${toErrorName(error)}` };
  } finally {
    // ends the sleep of a check that settled in time, and the calls of one that outlasted it
    stopped.abort();
  }
}

async function waitForTimeout(
  clock: Clock,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<PartReport> {
  await clock.sleep(timeoutMs, signal);

  return { isReady: false, reason: `the check took longer than ${timeoutMs} ms` };
}

function toErrorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
