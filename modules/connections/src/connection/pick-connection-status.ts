export type ListedStatus = 'active' | 'failing' | 'needs_consent' | 'expiring' | 'forgotten';

export interface StatusFacts {
  readonly binding: string;
  readonly status: string;

  // the grant's end, for a grant of limited time
  readonly refreshExpiresAtMs: number | null;
  readonly nowMs: number;
}

export const expiringWindowMs = 3 * 24 * 60 * 60 * 1000;

// The status the owner sees. A connection past the end of its grant needs consent, and one within 3
// days of it is expiring. When two statuses hold, the first of needs_consent, failing and expiring
// wins.
export function pickConnectionStatus(facts: StatusFacts): ListedStatus {
  if (facts.binding !== 'enabled' || facts.status === 'forgotten') {
    return 'forgotten';
  }

  const endsAtMs = facts.refreshExpiresAtMs;

  if (facts.status === 'needs_consent' || (endsAtMs !== null && endsAtMs <= facts.nowMs)) {
    return 'needs_consent';
  }

  if (facts.status === 'failing') {
    return 'failing';
  }

  return endsAtMs !== null && endsAtMs - facts.nowMs <= expiringWindowMs ? 'expiring' : 'active';
}
