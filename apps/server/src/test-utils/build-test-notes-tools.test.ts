import { expect, test } from 'bun:test';
import { buildPolicyCall } from '@heynixie/policy/test-utils';
import { buildTestNotesTools } from './build-test-notes-tools';

test('it serves notes_read, which returns the note given', async () => {
  const notes = buildTestNotesTools('Buy oat milk.');
  const [tool] = notes.tools.definitions;

  expect(tool?.name).toBe('notes_read');

  const outcome = await tool?.run(
    { callID: 'call-1', tool: 'notes_read', input: {}, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['notes_read'],
        model: { model: 'claude-test-1', profile: 'chat-direct' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { text: 'Buy oat milk.' },
  });
});

test('it allows a call to notes_read while the policy declares it a read', async () => {
  const notes = buildTestNotesTools('Buy oat milk.');

  const decided = await notes.tools.decide(
    buildPolicyCall({ tool: 'notes_read', toolList: ['notes_read'] }),
  );

  expect(decided.decision).toMatchObject({
    outcome: 'allow',
    stage: 7,
    rule: { id: 'allow-reads', revision: 1 },
  });
});

test('it asks for the next call to notes_read once the policy declares it a delete', async () => {
  const notes = buildTestNotesTools('Buy oat milk.');

  notes.setEffects(['delete']);

  const decided = await notes.tools.decide(
    buildPolicyCall({ tool: 'notes_read', toolList: ['notes_read'] }),
  );

  expect(decided.decision).toMatchObject({
    outcome: 'ask',
    stage: 6,
    rule: { id: 'ask-permanent-deletes', revision: 1 },
  });
});

test('it denies a tool the policy declares nothing for at the registry stage', async () => {
  const notes = buildTestNotesTools('Buy oat milk.');

  const decided = await notes.tools.decide(
    buildPolicyCall({ tool: 'notes_write', toolList: ['notes_write'] }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'deny', stage: 1, rule: null });
});

test('it names the declared effects in its policy hash, which changes with them', () => {
  const notes = buildTestNotesTools('Buy oat milk.');
  const before = notes.getPolicyHash();

  notes.setEffects(['read', 'send']);

  expect([before, notes.getPolicyHash()]).toStrictEqual(['policy:read', 'policy:read+send']);
});
