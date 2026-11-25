import { expect, test } from 'bun:test';
import { pickAnnotationEffects } from './pick-annotation-effects';

test.each([
  { title: 'a read-only tool', annotations: { readOnlyHint: true }, effects: ['read'] },
  {
    title: 'a read-only hint that wins over a destructive one',
    annotations: { readOnlyHint: true, destructiveHint: true },
    effects: ['read'],
  },
  {
    title: 'a writing tool that is not destructive',
    annotations: { readOnlyHint: false, destructiveHint: false },
    effects: ['write', 'send'],
  },
  {
    title: 'a writing tool with no destructive hint',
    annotations: { readOnlyHint: false },
    effects: ['write', 'delete', 'send'],
  },
  { title: 'a tool with no annotations', annotations: null, effects: ['write', 'delete', 'send'] },
  {
    title: 'a tool with only a title',
    annotations: { title: 'x' },
    effects: ['write', 'delete', 'send'],
  },
])('it declares $effects for $title', (row) => {
  expect(pickAnnotationEffects(row.annotations)).toStrictEqual(row.effects);
});

test.each([
  { title: 'a read-only hint that is a string', annotations: { readOnlyHint: 'yes' } },
  { title: 'a destructive hint that is a number', annotations: { destructiveHint: 1 } },
])('it declares nothing for $title', (row) => {
  expect(pickAnnotationEffects(row.annotations)).toBeNull();
});
