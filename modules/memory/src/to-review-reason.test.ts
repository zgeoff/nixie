import { expect, test } from 'bun:test';
import { toReviewReason } from './to-review-reason';

test('it keeps a review reason this release knows', () => {
  expect(toReviewReason('pinned')).toBe('pinned');
});

test('it reads a review reason this release does not know as other', () => {
  expect(toReviewReason('self_note')).toBe('other');
});
