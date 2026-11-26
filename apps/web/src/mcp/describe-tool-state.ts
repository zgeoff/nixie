import { match } from 'ts-pattern';
import type { McpTool } from './types';

// A tool waits only while a proposal of it is open: an answered proposal leaves the state as it
// was, and a tool that the registry refuses never gets one.
export function describeToolState(tool: McpTool): string {
  const isWaiting = tool.proposalID !== null;

  return match(tool.state)
    .with('exposed', () => 'Allowed')
    .with('stopped_changed', () =>
      isWaiting
        ? 'Stopped: changed, waits for your review'
        : 'Stopped: changed since you allowed it',
    )
    .with('stopped_unfit', () => 'Stopped: its form does not fit')
    .with('hidden_new', () =>
      isWaiting
        ? 'Hidden: waits for your approval'
        : `Hidden: ${tool.hiddenReason ?? 'not allowed'}`,
    )
    .with('removed', () => 'Removed by the server')
    .exhaustive();
}
