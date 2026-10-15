// Tells whether a line from checkIsolationTargets passes the isolation test: the sandbox failed to
// connect, and the runner either connected to the target's listener or printed it as unprovable.
// A line whose listener failed, or whose sandbox connected, does not pass.
export function isClearIsolationLine(line: string): boolean {
  return /:\d+ listener (?:connected|unprovable from the runner, [^;]+); sandbox failed /u.test(
    line,
  );
}
