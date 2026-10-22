import { expect, mock, test } from 'bun:test';
import { buildRecordedCommits } from './build-recorded-commits';

test('it records each listener added and removed, and delivers events only to a listener still added', () => {
  const recorded = buildRecordedCommits();
  const kept = mock(() => {});
  const removed = mock(() => {});

  recorded.commits.addEventListener('commit', kept);
  recorded.commits.addEventListener('commit', removed);
  recorded.commits.removeEventListener('commit', removed);
  recorded.commits.dispatchEvent(new Event('commit'));

  expect(recorded.calls).toStrictEqual(['add commit', 'add commit', 'remove commit']);
  expect(kept).toHaveBeenCalledOnce();
  expect(removed).not.toHaveBeenCalled();
});
