import { expect, test } from 'bun:test';
import { describeToolState } from './describe-tool-state';
import type { McpTool } from './types';

function setupTest() {
  const tool: McpTool = {
    tool: 'tracker.item_get',
    state: 'exposed',
    hiddenReason: null,
    proposalID: null,
  };

  return { tool };
}

test.each([
  ['hidden_new', 'p1', null, 'Hidden: waits for your approval'],
  ['hidden_new', null, null, 'Hidden: not allowed'],
  ['hidden_new', null, 'its name is taken', 'Hidden: its name is taken'],
  ['stopped_changed', 'p1', null, 'Stopped: changed, waits for your review'],
  ['stopped_changed', null, null, 'Stopped: changed since you allowed it'],
  ['exposed', null, null, 'Allowed'],
] as const)(
  'it words the state %s with proposal %s and reason %s as "%s"',
  (state, proposalID, hiddenReason, text) => {
    const ctx = setupTest();

    expect(describeToolState({ ...ctx.tool, state, proposalID, hiddenReason })).toBe(text);
  },
);
