// The key of an `hour`, minutes or `at` fire: the instant in UTC.
export function buildInstantKey(definitionID: string, instantMs: number): string {
  return `${definitionID}|${new Date(instantMs).toISOString()}`;
}
