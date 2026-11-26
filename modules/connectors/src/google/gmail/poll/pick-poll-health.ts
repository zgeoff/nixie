const unhealthyAfter = 3;

// The health the source reports after a cycle: unhealthy after 3 failed polls in a row of any
// polled connection, running once the last poll of every one succeeded, and null in between, which
// leaves the last report standing.
export function pickPollHealth(failures: readonly number[]): 'running' | 'unhealthy' | null {
  if (failures.some((count) => count >= unhealthyAfter)) {
    return 'unhealthy';
  }

  return failures.every((count) => count === 0) ? 'running' : null;
}
