import { expect, test } from 'bun:test';
import { toTerminalLines } from './to-terminal-lines';

test('it drops colour and title sequences', () => {
  const raw = '\u001B]0;user@host\u0007\u001B[32mok\u001B[0m done\n';

  expect(toTerminalLines(raw)).toBe('ok done');
});

test('it lets a carriage return overwrite the line and a backspace move the cursor back', () => {
  const raw = 'loading 10%\rloading 90%\nabx\b \bc\n';

  expect(toTerminalLines(raw)).toBe('loading 90%\nabc');
});

test('it keeps the last 32 lines', () => {
  const raw = Array.from({ length: 40 }, (_, index) => `line ${String(index)}`).join('\n');

  expect(toTerminalLines(raw).split('\n')).toHaveLength(32);
});

test('it returns an empty string for an empty log', () => {
  expect(toTerminalLines('')).toBe('');
});
