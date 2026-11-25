// The path of each procedure under a contract node, below the path given.
export function collectProcedurePaths(node: unknown, path: readonly string[] = []): string[][] {
  if (typeof node !== 'object' || node === null) {
    return [];
  }

  if ('~orpc' in node) {
    return [[...path]];
  }

  return Object.entries(node).flatMap(([key, child]) =>
    collectProcedurePaths(child, [...path, key]),
  );
}
