const dayMs = 24 * 60 * 60 * 1000;

// The first day of the trigger report: 7 days before `now`, as the viewer's own calendar reads it
export function buildReportSince(now: Date, days = 7): string {
  const start = new Date(now.getTime() - days * dayMs);

  const month = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');

  return `${String(start.getFullYear())}-${month}-${day}`;
}
