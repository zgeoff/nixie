// A memory's date in the browser's own locale and time zone, such as "Mar 1, 2026" in English.
export function formatMemoryDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
