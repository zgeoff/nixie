import { expect, test } from 'bun:test';
import { getHome } from './get-home';

test('it reads the guest home from its env', () => {
  expect(getHome({ HOME: '/home/guest' })).toBe('/home/guest');
});

test('it refuses a guest env with an empty HOME', () => {
  expect(() => getHome({ HOME: '' })).toThrowWithMessage(Error, /needs HOME/u);
});
