import type { ConnectorFailure, ToolOutcome } from '@heynixie/tools';

export function buildFailureOutcome(failure: ConnectorFailure): ToolOutcome {
  return { status: 'error', message: failure.detail ?? failure.code, failure };
}
