import { expect, test } from 'bun:test';
import { buildSpanStateFromEvents } from './build-span-state-from-events';

test('it labels each edit with the beforeinput before it', () => {
  expect(
    buildSpanStateFromEvents([
      { event: 'beforeinput', inputType: 'insertText', data: 'a', selection: [0, 0] },
      { event: 'input', value: 'a' },
      { event: 'beforeinput', inputType: 'insertFromPaste', data: null, selection: [1, 1] },
      { event: 'input', value: 'a pear' },
    ]),
  ).toStrictEqual({
    spans: [
      { end: 1, source: 'typed', start: 0 },
      { end: 6, source: 'pasted', start: 1 },
    ],
    text: 'a pear',
  });
});

test('it labels an input with no beforeinput before it as unknown', () => {
  expect(
    buildSpanStateFromEvents([
      { event: 'beforeinput', inputType: 'insertText', data: 'a', selection: [0, 0] },
      { event: 'input', value: 'a' },
      { event: 'input', value: 'ab' },
    ]),
  ).toStrictEqual({
    spans: [
      { end: 1, source: 'typed', start: 0 },
      { end: 2, source: 'unknown', start: 1 },
    ],
    text: 'ab',
  });
});
