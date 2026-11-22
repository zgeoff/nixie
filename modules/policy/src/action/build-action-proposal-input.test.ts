import { expect, test } from 'bun:test';
import { buildActionHash } from './build-action-hash';
import { buildActionProposalInput } from './build-action-proposal-input';

function setupTest() {
  const facts = {
    definitions: { snapshotHash: 'sha256:test' },
    thread: 'conversation',
    callSequence: 4,
    tool: 'computer.screen_click',
    effects: ['send' as const],
    cause: 'ask_rule' as const,
    input: { x: 10, y: 20, button: 'left' },
    destinations: [{ value: 'site.test', replyTarget: false }],
  };

  return { facts };
}

test('it records the hash of an ask with the tool, its input and its destinations', () => {
  const ctx = setupTest();
  const proposal = buildActionProposalInput(ctx.facts);

  expect(proposal.record.payload?.['actionHash']).toBe(
    buildActionHash({
      tool: 'computer.screen_click',
      input: ctx.facts.input,
      destinations: ['site.test'],
      deadlineAt: null,
    }),
  );
});

test('it records the hash the caller gives, which covers the window the call expects', () => {
  const ctx = setupTest();

  const actionHash = buildActionHash({
    tool: 'computer.screen_click',
    input: ctx.facts.input,
    destinations: ['site.test'],
    deadlineAt: null,
    expectWindow: { windowID: '0x1', kind: 'browser', picture: 'aa' },
  });

  const proposal = buildActionProposalInput({ ...ctx.facts, actionHash });

  expect(proposal.record.payload?.['actionHash']).toBe(actionHash);
});
