import { expect, test } from 'bun:test';
import { renderLinkCounts } from './render-link-counts';

test.each([
  [{}, null],
  [{ disputedBy: 0, supersededBy: 0 }, null],
  [{ disputedBy: 1 }, '(disputed by 1 note)'],
  [{ supersededBy: 3 }, '(superseded by 3 notes)'],
  [{ disputedBy: 1, supersededBy: 1 }, '(disputed by 1 note · superseded by 1 note)'],
])('#renderLinkCounts shows %j as %p', (counts, expected) => {
  expect(renderLinkCounts(counts)).toBe(expected);
});
