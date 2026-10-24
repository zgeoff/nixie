import { expect, test } from 'bun:test';
import { pickCurrentLabels } from './pick-current-labels.ts';

test('it moves a label to the stale list when the rebuilt query differs from the message the labeller saw', () => {
  expect(
    pickCurrentLabels(
      [
        {
          caseID: 't3',
          stepSequence: 2,
          recalledSequence: 3,
          recordedAt: 0,
          query: 'what should I pack?',
          reply: '',
          earlier: [],
          candidates: [],
          logged: [],
          searchMode: 'hybrid',
          delivered: [],
          ratings: [],
        },
        {
          caseID: 't8',
          stepSequence: 7,
          recalledSequence: 8,
          recordedAt: 0,
          query: 'is it cold there?\nand the weather?',
          reply: '',
          earlier: [],
          candidates: [],
          logged: [],
          searchMode: 'hybrid',
          delivered: [],
          ratings: [],
        },
      ],
      [
        { caseID: 't3', relevant: ['M1'], best: 'M1' },
        { caseID: 't8', relevant: [], best: null },
      ],
      [
        { caseID: 't3', earlier: [], message: 'what should I pack?', reply: '', items: [] },
        { caseID: 't8', earlier: [], message: 'and the weather?', reply: '', items: [] },
      ],
    ),
  ).toStrictEqual({ labels: [{ caseID: 't3', relevant: ['M1'], best: 'M1' }], stale: ['t8'] });
});

test('it counts a label as stale when the sample lacks its case', () => {
  expect(
    pickCurrentLabels(
      [
        {
          caseID: 't3',
          stepSequence: 2,
          recalledSequence: 3,
          recordedAt: 0,
          query: 'what should I pack?',
          reply: '',
          earlier: [],
          candidates: [],
          logged: [],
          searchMode: 'hybrid',
          delivered: [],
          ratings: [],
        },
      ],
      [{ caseID: 't3', relevant: [], best: null }],
      [],
    ),
  ).toStrictEqual({ labels: [], stale: ['t3'] });
});

test('it keeps a label whose case the turns lack, for the gold builder to refuse', () => {
  expect(pickCurrentLabels([], [{ caseID: 't70', relevant: [], best: null }], [])).toStrictEqual({
    labels: [{ caseID: 't70', relevant: [], best: null }],
    stale: [],
  });
});
