import { expect, test } from 'bun:test';
import { buildMockCheckerAnswer } from './test-utils/build-mock-checker-answer';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { createProposal } from './test-utils/create-proposal';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

test('it lists a quoted proposal with its quote inside the message it came from', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'unsure' })) },
  });

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I think I might take up rowing',
    spans: [{ start: 0, end: 30, source: 'typed' }],
  });

  await memory.store.writes.remember({
    text: 'Takes up rowing',
    quote: 'take up rowing',
    caller: buildMockWriteCaller(),
  });

  const proposals = await memory.store.view.readProposals();

  expect(proposals).toMatchObject([
    {
      reason: 'checker_unsure',
      text: 'Takes up rowing',
      quote: 'take up rowing',
      evidence: {
        recordSequence: sequence,
        start: 16,
        end: 30,
        message: { status: 'readable', text: 'I think I might take up rowing' },
      },
    },
  ]);
});

test('it lists a proposal with no quote with no evidence', async () => {
  const memory = await startTestMemory();
  const proposal = await createProposal(memory.store, { text: 'Owns a canoe' });
  const proposals = await memory.store.view.readProposals();

  expect(proposals).toStrictEqual([{ ...proposal, evidence: null }]);
});
