import type { HealthReport, PartCheck, PartReport } from './types';

// Runs every part's check at once and reports each part, with a check that throws or outlasts
// timeoutMs reported unready, so one stuck part never stalls the endpoint.
export async function checkParts(
  checks: Readonly<Record<string, PartCheck>>,
  timeoutMs: number,
): Promise<HealthReport> {
  const entries = await Promise.all(
    Object.entries(checks).map(
      async ([part, check]) => [part, await runCheck(check, timeoutMs)] as const,
    ),
  );
  const parts = Object.fromEntries(entries);

  return {
    status: entries.every(([, report]) => report.isReady) ? 'ready' : 'unready',
    parts,
  };
}

async function runCheck(check: PartCheck, timeoutMs: number): Promise<PartReport> {
  const timer = Promise.withResolvers<PartReport>();
  const timeout = setTimeout(timer.resolve, timeoutMs, {
    isReady: false,
    reason: `the check took longer than ${timeoutMs} ms`,
  });

  try {
    return await Promise.race([check(), timer.promise]);
  } catch (error) {
    return { isReady: false, reason: `the check failed: ${toErrorName(error)}` };
  } finally {
    clearTimeout(timeout);
  }
}

function toErrorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
