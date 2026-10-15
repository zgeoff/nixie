import { expect, onTestFinished, test } from 'bun:test';
import { updateSystemColorScheme } from './update-system-color-scheme';

test('it makes the dark color scheme query match', () => {
  updateSystemColorScheme('dark');

  expect(globalThis.matchMedia('(prefers-color-scheme: dark)').matches).toBeTrue();
});

test('it tells a color scheme query handleChange about the change', () => {
  const query = globalThis.matchMedia('(prefers-color-scheme: dark)');
  const seen: boolean[] = [];

  const handleChange = (): void => {
    seen.push(query.matches);
  };

  query.addEventListener('change', handleChange);

  onTestFinished(() => {
    query.removeEventListener('change', handleChange);
  });

  updateSystemColorScheme('dark');

  expect(seen).toStrictEqual([true]);
});
