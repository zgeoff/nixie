// The wait before the writer tries again after its nth failure in a row: the first backoff,
// doubling with each failure up to the maximum. The writer never fails its task, so capture resumes
// once the cause clears.
export function planWriterBackoff(failures: number, firstMs: number, maxMs: number): number {
  return Math.min(firstMs * 2 ** Math.max(failures - 1, 0), maxMs);
}
