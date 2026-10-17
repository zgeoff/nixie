// Formats how long ago you wrote a message that waits on you, as in 5 min ago, 3 h ago or 2 d ago,
// each rounded down. A message with no written time reads as written earlier.
export function formatOutboxAge(writtenAt: string | undefined, now: number): string {
  const at = writtenAt === undefined ? Number.NaN : Date.parse(writtenAt);

  if (Number.isNaN(at)) {
    return 'written earlier';
  }

  const minutes = Math.max(Math.floor((now - at) / 60_000), 0);

  if (minutes < 60) {
    return `written ${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  return hours < 24 ? `written ${hours} h ago` : `written ${Math.floor(hours / 24)} d ago`;
}
