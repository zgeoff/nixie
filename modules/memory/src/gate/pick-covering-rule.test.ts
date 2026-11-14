import { expect, test } from 'bun:test';
import type { MemoryWriteVerdict } from '@heynixie/tools';
import { pickCoveringRule } from './pick-covering-rule';

test.each<[string, MemoryWriteVerdict | undefined]>([
  ['no verdict', undefined],
  ['the gate verdict', { kind: 'gate' }],
  ['an ask verdict', { kind: 'rule-ask', rule: { id: 'rule-a', revision: 1 } }],
])('#pickCoveringRule returns null for %s', (_title, verdict) => {
  expect(pickCoveringRule(verdict, 'none')).toBeNull();
});

test('#pickCoveringRule covers a plain write with the first allow rule', () => {
  const covering = pickCoveringRule(
    {
      kind: 'rule-allow',
      rules: [
        { id: 'rule-a', revision: 1, checks: [] },
        { id: 'rule-b', revision: 2, checks: [] },
      ],
    },
    'none',
  );

  expect(covering).toStrictEqual({ id: 'rule-a', revision: 1 });
});

test('#pickCoveringRule leaves a self-note uncovered when no rule checks the subject is self', () => {
  const covering = pickCoveringRule(
    {
      kind: 'rule-allow',
      rules: [
        { id: 'rule-a', revision: 1, checks: [] },
        { id: 'rule-b', revision: 2, checks: [{ arg: 'subject', op: 'in', value: ['self'] }] },
      ],
    },
    'self_note',
  );

  expect(covering).toBeNull();
});

test('#pickCoveringRule covers a self-note with the rule that checks the subject is self, though others match first', () => {
  const covering = pickCoveringRule(
    {
      kind: 'rule-allow',
      rules: [
        { id: 'rule-a', revision: 1, checks: [] },
        { id: 'rule-b', revision: 2, checks: [{ arg: 'subject', op: 'eq', value: 'self' }] },
      ],
    },
    'self_note',
  );

  expect(covering).toStrictEqual({ id: 'rule-b', revision: 2 });
});

test('#pickCoveringRule covers a photo write only with a rule that checks an image argument', () => {
  const rules = [
    { id: 'rule-a', revision: 1, checks: [{ arg: 'subject', op: 'eq' as const, value: 'owner' }] },
    {
      id: 'rule-b',
      revision: 2,
      checks: [{ arg: 'image.eventID', op: 'matches' as const, value: '*' }],
    },
  ];

  expect(pickCoveringRule({ kind: 'rule-allow', rules: rules.slice(0, 1) }, 'photo')).toBeNull();

  expect(pickCoveringRule({ kind: 'rule-allow', rules }, 'photo')).toStrictEqual({
    id: 'rule-b',
    revision: 2,
  });
});
