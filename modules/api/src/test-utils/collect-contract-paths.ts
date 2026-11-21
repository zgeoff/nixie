// The path of each procedure of a contract tree, as the API serves it.
export function collectContractPaths(node: unknown, path: readonly string[] = []): string[] {
  if (typeof node !== 'object' || node === null) {
    return [];
  }

  if ('~orpc' in node) {
    return [`/rpc/${path.join('/')}`];
  }

  return Object.entries(node).flatMap(([key, child]) =>
    collectContractPaths(child, [...path, key]),
  );
}
