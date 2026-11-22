import { expect, test } from 'bun:test';
import { parseActiveWindow } from './parse-active-window';

test('it reads the active window', () => {
  expect(parseActiveWindow('_NET_ACTIVE_WINDOW(WINDOW): window id # 0x400003')).toBe('0x400003');
});

test('it reads no active window from the zero ID', () => {
  expect(parseActiveWindow('_NET_ACTIVE_WINDOW(WINDOW): window id # 0x0')).toBeNull();
});
