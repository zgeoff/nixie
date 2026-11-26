import { onTestFinished } from 'bun:test';
import { setShortIDDrawer } from '@heynixie/db';

// Makes each short ID that nixie draws come from the list, in order, until the test ends. A draw past
// the list's end fails the test.
export function startShortIDDraws(draws: readonly string[]): void {
  const remaining = [...draws];

  setShortIDDrawer(() => {
    const next = remaining.shift();

    if (next === undefined) {
      throw new Error('a short ID was drawn past the test draws');
    }

    return next;
  });

  onTestFinished(() => {
    setShortIDDrawer(null);
  });
}
