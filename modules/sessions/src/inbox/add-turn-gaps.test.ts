import { expect, test } from 'bun:test';
import { addTurnGaps } from './add-turn-gaps';

test('it adds both gaps to the opening tag of an owner message', () => {
  expect(
    addTurnGaps(
      [
        '<owner-message id="48213" sent="Sat 21 Nov, 18:05, Sydney">',
        'Hi',
        '</owner-message>',
      ].join('\n'),
      { sinceYourLastTurn: '3 h 12 min', sinceOwnerLastWrote: '3 h 40 min' },
    ),
  ).toBe(
    [
      '<owner-message id="48213" sent="Sat 21 Nov, 18:05, Sydney" since-your-last-turn="3 h 12 min" since-owner-last-wrote="3 h 40 min">',
      'Hi',
      '</owner-message>',
    ].join('\n'),
  );
});

test('it adds the gaps to the opening tag of a system message and leaves the body alone', () => {
  expect(
    addTurnGaps(
      [
        '<system-message type="reminder" id="a1b2" at="Sat 21 Nov, 18:05, Sydney">',
        'Reminder: <b>',
        '</system-message id="a1b2">',
      ].join('\n'),
      { sinceYourLastTurn: '58 min', sinceOwnerLastWrote: '40 s' },
    ),
  ).toBe(
    [
      '<system-message type="reminder" id="a1b2" at="Sat 21 Nov, 18:05, Sydney" since-your-last-turn="58 min" since-owner-last-wrote="40 s">',
      'Reminder: <b>',
      '</system-message id="a1b2">',
    ].join('\n'),
  );
});

test('it leaves out a gap that is null', () => {
  expect(
    addTurnGaps('<owner-message id="1" sent="x">\nHi\n</owner-message>', {
      sinceYourLastTurn: null,
      sinceOwnerLastWrote: '5 s',
    }),
  ).toBe('<owner-message id="1" sent="x" since-owner-last-wrote="5 s">\nHi\n</owner-message>');
});

test('it leaves text that opens with no message tag as it was', () => {
  expect(
    addTurnGaps('A trigger.fired record arrived: {}', {
      sinceYourLastTurn: '1 min',
      sinceOwnerLastWrote: '2 min',
    }),
  ).toBe('A trigger.fired record arrived: {}');
});
