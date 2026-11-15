// The only calls a read-only token may make. Each one reads, and none writes a row, so a call with
// the token leaves nixie's data as it was.
const readOnlyProcedurePaths: ReadonlySet<string> = new Set([
  '/rpc/conversation/read',
  '/rpc/tasks/list',
  '/rpc/tasks/read',
]);

export function isReadOnlyProcedure(pathname: string): boolean {
  return readOnlyProcedurePaths.has(pathname);
}
