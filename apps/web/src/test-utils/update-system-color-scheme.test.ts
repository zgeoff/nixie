import { expect, mock, onTestFinished, test } from 'bun:test';
import { updateSystemColorScheme } from './update-system-color-scheme';

test('it makes the dark color scheme query match', () => {
  updateSystemColorScheme('dark');

  expect(globalThis.matchMedia('(prefers-color-scheme: dark)').matches).toBeTrue();
});

test('it tells a color scheme query listener about the change', () => {
  const query = globalThis.matchMedia('(prefers-color-scheme: dark)');
  const listener = mock<(event: MediaQueryListEvent) => void>();

  query.addEventListener('change', listener);
  onTestFinished(() => {
    query.removeEventListener('change', listener);
  });
  updateSystemColorScheme('dark');

  expect(listener).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ matches: true }));
});
