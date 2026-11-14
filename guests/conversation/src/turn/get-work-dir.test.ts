import { expect, test } from 'bun:test';
import { getWorkDir } from './get-work-dir';

test('it puts the working directory under the guest home', () => {
  expect(getWorkDir('/home/guest')).toBe('/home/guest/conversation');
});
