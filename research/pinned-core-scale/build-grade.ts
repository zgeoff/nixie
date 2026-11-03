export interface Probe {
  // every word the reply needs, from the current core
  readonly expect: readonly string[];

  // the old values a reply that follows the opening's copy would give
  readonly stale: readonly string[];
}

export interface Grade {
  readonly hasCurrent: boolean;
  readonly hasStale: boolean;
}

// A reply can name an old value while it follows the change, as in "she moved from Ghent", so a
// reply with both marks gets read by hand.
export function buildGrade(reply: string, probe: Probe): Grade {
  const text = reply.toLowerCase();

  return {
    hasCurrent: probe.expect.every((word) => text.includes(word.toLowerCase())),
    hasStale: probe.stale.some((word) => text.includes(word.toLowerCase())),
  };
}

export function formatGrade(grade: Grade): string {
  return `${grade.hasCurrent ? 'current' : 'MISS'}${grade.hasStale ? '+stale' : ''}`;
}
