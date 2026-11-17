import { expect, test } from 'bun:test';
import { buildMockWorkerTarget } from './build-mock-worker-target';

test('it builds a target on the profile and model it is given', () => {
  const target = buildMockWorkerTarget('big', 'claude-test-big');

  expect(target.profile.profile).toMatchObject({ id: 'big', model: 'claude-test-big' });
  expect(target.image).toBe('image-big');
});
