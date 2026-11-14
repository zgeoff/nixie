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
