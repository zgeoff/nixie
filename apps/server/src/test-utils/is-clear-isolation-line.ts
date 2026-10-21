export function isClearIsolationLine(line: string): boolean {
  return /:\d+ listener (?:connected|unprovable from the runner, [^;]+); sandbox failed /u.test(
    line,
  );
}
