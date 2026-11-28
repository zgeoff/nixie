import { match } from 'ts-pattern';
import type { McpTool } from './types';

// A tool waits only while a proposal of it is open: an answered proposal leaves the state as it
// was. Only a change that widens what a tool accepts gets a proposal.
export function describeToolState(tool: McpTool): string {
  const isWaiting = tool.proposalID !== null;

  return match(tool.state)
    .with('exposed', () => 'Available')
    .with('stopped_changed', () =>
      isWaiting
        ? 'Stopped: takes new input, waits for you to accept the change'
        : 'Stopped: takes new input since the last form you accepted',
    )
    .with('stopped_unfit', () => 'Stopped: its form does not fit')
    .with('hidden_new', () => `Hidden: ${tool.hiddenReason ?? 'waits for the next listing'}`)
    .with('removed', () => 'Removed by the server')
    .exhaustive();
}
