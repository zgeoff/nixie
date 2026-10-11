import { expect, test } from 'bun:test';
import { buildSnapshotPolicy } from './build-snapshot-policy';

test('it lists each rule and each tool declaration in plain JSON', () => {
  const policy = buildSnapshotPolicy(
    [{ id: 'slice1.read-only', revision: 1, sentence: 'Reads only.', pickOutcome: () => null }],
    [
      {
        name: 'web_fetch',
        description: 'Fetches one page.',
        input: { type: 'object' },
        output: { type: 'object' },
        declaration: {
          effects: ['fetch'],
          destinations: [],
          amount: null,
          content: [],
          results: { text: 'untrusted' },
        },
        execution: 'direct',
        run: () => Promise.reject(new Error('unused')),
      },
    ],
  );

  expect(policy).toStrictEqual({
    rules: [{ id: 'slice1.read-only', revision: 1, sentence: 'Reads only.' }],
    tools: [
      {
        name: 'web_fetch',
        effects: ['fetch'],
        destinations: [],
        amount: null,
        content: [],
        results: { text: 'untrusted' },
      },
    ],
  });
});
