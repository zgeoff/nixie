import type { AttentionStatus } from './types';

// The tools that calls through a connection can no longer reach, of those its granted scopes cover.
// A connection that needs consent stops every call. A failing or expiring one still serves its calls.
export function collectRemovedToolNames(
  status: AttentionStatus,
  coveredTools: readonly string[],
): string[] {
  return status === 'needs_consent' ? [...coveredTools] : [];
}
