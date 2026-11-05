import { expect, test } from 'bun:test';
import { parseLabelLines } from './parse-label-lines.ts';

test('it keeps the first label of each sampled turn and counts every line it drops', () => {
  const reply = [
    'Here are my ratings for part 1:',
    '{"caseID":"t1","relevant":["M2"],"best":"M2","by":"assistant"}',
    '',
    '{"caseID":"t2","relevant":[],"best":null,"by":"assistant"}',
    '{"caseID":"t1","relevant":["M2"],"best":"M2","by":"assistant"}',
    '{"caseID":"t2","relevant":["M1"],"best":"M1","by":"assistant"}',
    '{"caseID":"t9","relevant":[],"best":null}',
    '{"caseID":"t3","relevant":"M1"}',
    'That was a fun one.',
  ].join('\n');

  expect(parseLabelLines(reply, new Set(['t1', 't2', 't3']))).toStrictEqual({
    labels: [
      { caseID: 't1', relevant: ['M2'], best: 'M2', by: 'assistant' },
      { caseID: 't2', relevant: [], best: null, by: 'assistant' },
    ],
    dropped: { notLabel: 3, outsideSample: 1, duplicate: 1, conflicting: 1 },
  });
});
