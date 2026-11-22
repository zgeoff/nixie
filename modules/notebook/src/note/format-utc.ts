export function formatUTC(atMs: number): string {
  return new Date(atMs).toISOString().replace(/\.\d{3}Z$/u, 'Z');
}
