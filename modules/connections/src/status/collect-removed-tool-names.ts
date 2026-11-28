import type { ConnectorAction } from '../connector/types';
import type { AttentionStatus } from './types';

// The tools that calls through a connection can no longer reach. A connection that needs consent or
// is disconnected stops every call. A failing or expiring one still serves its calls.
export function collectRemovedToolNames(
  status: AttentionStatus,
  actions: readonly ConnectorAction[],
): string[] {
  return status === 'needs_consent' || status === 'disconnected'
    ? actions.map((action) => action.tool.name)
    : [];
}
