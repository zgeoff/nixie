import { expect, test } from 'bun:test';
import { buildSnapshotPolicy } from './build-snapshot-policy';

test('it lists each rule and each tool declaration in plain JSON', () => {
  const policy = buildSnapshotPolicy(
    [
      {
        id: 'slice1.queue-check',
        revision: 1,
        rule: { id: 'slice1.queue-check', outcome: 'allow', tools: ['actions.log'] },
      },
    ],
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
    { prompt: 'sha256:aa', profile: 'checker-direct' },
  );

  expect(policy).toStrictEqual({
    rules: [
      {
        id: 'slice1.queue-check',
        revision: 1,
        sentence: '**Allow** `actions.log`.',
        rule: { id: 'slice1.queue-check', outcome: 'allow', tools: ['actions.log'] },
      },
    ],
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
    contacts: [],
    consent: { prompt: 'sha256:aa', profile: 'checker-direct' },
  });
});
