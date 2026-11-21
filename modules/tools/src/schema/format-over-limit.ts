export type LimitUnit = 'characters' | 'items';

// A length limit says how far over it the value runs, so the model can cut to fit in one try.
export function formatOverLimit(size: number, limit: number, unit: LimitUnit): string {
  return `is ${formatCount(size)} ${unit}, ${formatCount(size - limit)} over the ${formatCount(limit)} limit`;
}

function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}
