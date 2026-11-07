import { expect, test } from 'bun:test';
import { getHarness } from './get-harness';

test('it gives the Agent SDK record, which speaks the Anthropic Messages API', () => {
  expect(getHarness('agent-sdk')).toMatchObject({
    id: 'agent-sdk',
    api: 'anthropic-messages',
    guest: { package: 'conversation', entries: { turn: 'main', check: 'check' } },
    imageKey: 'conversation',
    toolUseMetaKey: 'claudecode/toolUseId',
  });
});

test('it throws for a harness with no record', () => {
  expect(() => getHarness('codex')).toThrow('the harness codex has no record');
});
