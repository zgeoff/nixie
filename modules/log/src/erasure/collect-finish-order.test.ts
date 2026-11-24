import { expect, test } from 'bun:test';
import { collectFinishOrder } from './collect-finish-order';

test.each([
  {
    title: 'a child that the parent reached',
    erasureIDs: ['parent', 'child'],
    reached: { parent: ['child'] },
    order: ['child', 'parent'],
  },
  {
    title: 'a joined child that another erasure started, listed after its parent',
    erasureIDs: ['parent', 'joined', 'own'],
    reached: { parent: ['joined', 'own'] },
    order: ['joined', 'own', 'parent'],
  },
  {
    title: 'a child that two parents reached',
    erasureIDs: ['first', 'second', 'shared'],
    reached: { first: ['shared'], second: ['shared'] },
    order: ['shared', 'first', 'second'],
  },
  {
    title: 'a cycle',
    erasureIDs: ['left', 'right'],
    reached: { left: ['right'], right: ['left'] },
    order: ['right', 'left'],
  },
  {
    title: 'a reached ID outside the tree',
    erasureIDs: ['parent'],
    reached: { parent: ['elsewhere'] },
    order: ['parent'],
  },
])('#collectFinishOrder puts every child before its parent for $title', (row) => {
  const reached = new Map<string, ReadonlySet<string>>(
    Object.entries<readonly string[]>(row.reached).map(([id, ids]) => [id, new Set(ids)]),
  );

  expect(collectFinishOrder(row.erasureIDs, reached)).toStrictEqual(row.order);
});
