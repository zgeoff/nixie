import { expect, test } from 'bun:test';
import { getConfigDir } from './get-config-dir';

test('it puts the CLI config folder under the guest home', () => {
  expect(getConfigDir('/home/guest')).toBe('/home/guest/.claude');
});
