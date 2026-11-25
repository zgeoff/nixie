import { expect, test } from 'bun:test';
import { renderOutsideText } from '../tool/render-outside-text';
import { matchOutsideText } from './match-outside-text';

test('#matchOutsideText matches the seal of the text it names', () => {
  expect({ value: renderOutsideText('Your code is "482913".') }).toStrictEqual({
    value: matchOutsideText('Your code is "482913".'),
  });
});

test('#matchOutsideText rejects a text that is not sealed', () => {
  expect({ value: 'Your code is 482913.' }).not.toStrictEqual({
    value: matchOutsideText('Your code is 482913.'),
  });
});

test('#matchOutsideText rejects the seal of another text', () => {
  expect({ value: renderOutsideText('Another text.') }).not.toStrictEqual({
    value: matchOutsideText('Your code is 482913.'),
  });
});
