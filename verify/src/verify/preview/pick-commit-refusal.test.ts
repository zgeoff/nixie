import { expect, test } from 'bun:test';
import { pickCommitRefusal } from './pick-commit-refusal';

test('it accepts a preview that serves the commit the tree is at', () => {
  const commit = '4f1c2a9b7e3d5f6a8b9c0d1e2f3a4b5c6d7e8f90';

  expect(pickCommitRefusal(`${commit}\n`, commit)).toBeNull();
});

test('it refuses a preview that serves another commit', () => {
  expect(
    pickCommitRefusal(
      '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567',
      '4f1c2a9b7e3d5f6a8b9c0d1e2f3a4b5c6d7e8f90',
    ),
  ).toBe('the preview serves 0a1b2c3d4e5f, and this tree is at 4f1c2a9b7e3d');
});
