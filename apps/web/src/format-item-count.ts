export function formatItemCount(count: number): string {
  return `${String(count)} ${count === 1 ? 'item' : 'items'}`;
}
