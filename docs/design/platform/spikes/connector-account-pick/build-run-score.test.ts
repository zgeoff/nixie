import { expect, test } from 'bun:test';
import { buildRunScore } from './build-run-score.ts';

test('it fails a named run that passes a wrong account between two right calls', () => {
  expect(
    buildRunScore(
      { expect: 'Work', kind: 'label' },
      [
        { account: 'jordan.reyes@harbourline.example', id: 'p81vxxxbo8', label: 'Work' },
        { account: 'jordan@fernway.example', id: 'wbzmh8v96q', label: 'Personal' },
      ],
      'id-label',
      [
        { args: { connection: 'p81vxxxbo8' }, error: false },
        { args: { connection: 'wbzmh8v96q' }, error: false },
        { args: { connection: 'p81vxxxbo8' }, error: false },
      ],
    ),
  ).toStrictEqual({
    final: 'right',
    first: 'right',
    invalidCalls: 0,
    kind: 'label',
    pass: false,
    wrongAccountCalls: 1,
  });
});

test('it counts an invalid call after a right first call', () => {
  expect(
    buildRunScore(
      { expect: 'Old work', kind: 'label' },
      [
        { account: 'jr@quayside.example', id: 'k07v2nnzqf', label: 'Old work' },
        { account: 'jordan.reyes@harbourline.example', id: 'prva6ajc7u', label: 'Work' },
      ],
      'label',
      [
        { args: { connection: 'Old work' }, error: false },
        { args: { connection: null }, error: true },
      ],
    ),
  ).toStrictEqual({
    final: 'right',
    first: 'right',
    invalidCalls: 1,
    kind: 'label',
    pass: true,
    wrongAccountCalls: 0,
  });
});

test('it passes a named run whose calls all pass the right account', () => {
  expect(
    buildRunScore(
      { expect: 'Personal', kind: 'synonym' },
      [
        { account: 'jordan.reyes@harbourline.example', id: 'p81vxxxbo8', label: 'Work' },
        { account: 'jordan@fernway.example', id: 'wbzmh8v96q', label: 'Personal' },
      ],
      'id-label',
      [
        { args: { connection: 'wbzmh8v96q' }, error: false },
        { args: { connection: 'wbzmh8v96q' }, error: false },
      ],
    ),
  ).toStrictEqual({
    final: 'right',
    first: 'right',
    invalidCalls: 0,
    kind: 'synonym',
    pass: true,
    wrongAccountCalls: 0,
  });
});

test('it fails an ask run that makes a call', () => {
  expect(
    buildRunScore(
      { expect: null, kind: 'ask' },
      [
        { account: 'jordan.reyes@harbourline.example', id: 'p81vxxxbo8', label: 'Work' },
        { account: 'jordan@fernway.example', id: 'wbzmh8v96q', label: 'Personal' },
      ],
      'id-label',
      [{ args: { connection: 'p81vxxxbo8' }, error: false }],
    ),
  ).toStrictEqual({
    final: 'wrong',
    first: 'wrong-account',
    invalidCalls: 0,
    kind: 'ask',
    pass: false,
    wrongAccountCalls: 1,
  });
});

test('it passes an implied run that asks instead of calling', () => {
  expect(
    buildRunScore(
      { expect: 'Lowtide', kind: 'implied' },
      [
        { account: 'bookings@lowtide-band.example', id: 'kw761z5sl2', label: 'Lowtide' },
        { account: 'jordan@fernway.example', id: 'yzv07kwtsc', label: 'Personal' },
      ],
      'id-label',
      [],
    ),
  ).toStrictEqual({
    final: 'none',
    first: 'none',
    invalidCalls: 0,
    kind: 'implied',
    pass: true,
    wrongAccountCalls: 0,
  });
});

test('it counts a call whose connection is an array of the right ID as invalid', () => {
  expect(
    buildRunScore(
      { expect: 'Work', kind: 'label' },
      [
        { account: 'jordan.reyes@harbourline.example', id: 'p81vxxxbo8', label: 'Work' },
        { account: 'jordan@fernway.example', id: 'wbzmh8v96q', label: 'Personal' },
      ],
      'id-label',
      [{ args: { connection: ['p81vxxxbo8'] }, error: false }],
    ),
  ).toStrictEqual({
    final: 'wrong',
    first: 'invalid',
    invalidCalls: 1,
    kind: 'label',
    pass: false,
    wrongAccountCalls: 0,
  });
});
