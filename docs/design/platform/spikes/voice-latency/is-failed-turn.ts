// A turn failed when its result is not a success, or when the SDK flags an API error on a result
// whose subtype still says success.
export function isFailedTurn(row: Record<string, unknown>): boolean {
  return row.subtype !== 'success' || row.isError === true;
}
