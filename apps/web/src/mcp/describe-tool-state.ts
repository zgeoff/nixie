import { match } from 'ts-pattern';
import type { McpTool } from './types';

export function describeToolState(state: McpTool['state']): string {
  return match(state)
    .with('exposed', () => 'Allowed')
    .with('stopped_changed', () => 'Stopped: changed, waits for your review')
    .with('stopped_unfit', () => 'Stopped: its form does not fit')
    .with('hidden_new', () => 'Hidden: waits for your approval')
    .with('removed', () => 'Removed by the server')
    .exhaustive();
}
