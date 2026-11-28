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
  ['hidden_new', null, null, 'Hidden: waits for the next listing'],
  ['hidden_new', null, 'its name is taken', 'Hidden: its name is taken'],
  ['stopped_changed', 'p1', null, 'Stopped: takes new input, waits for you to accept the change'],
  ['stopped_changed', null, null, 'Stopped: takes new input since the last form you accepted'],
  ['exposed', null, null, 'Available'],
] as const)(
  'it words the state %s with proposal %s and reason %s as "%s"',
  (state, proposalID, hiddenReason, text) => {
    const ctx = setupTest();

    expect(describeToolState({ ...ctx.tool, state, proposalID, hiddenReason })).toBe(text);
  },
);
