import { expect, test } from 'bun:test';
import { buildRememberReply } from './build-remember-reply';

test('it builds a call of the memory.remember tool with its arguments, about the owner by default', () => {
  expect(
    buildRememberReply({ text: 'You live at 4 Elm Row.', quote: '4 Elm Row', sourceID: 3 }),
  ).toStrictEqual({
    toolUse: {
      name: 'memory.remember',
      input: { subject: 'owner', text: 'You live at 4 Elm Row.', quote: '4 Elm Row', sourceID: 3 },
    },
  });
});

test('it builds a call with the end time the call names', () => {
  expect(
    buildRememberReply({
      text: 'Sam is in Lisbon this week.',
      quote: 'in Lisbon this week',
      sourceID: 3,
      until: '2026-10-25T23:59:59+00:00',
    }),
  ).toStrictEqual({
    toolUse: {
      name: 'mcp__nixie__memory_remember',
      input: {
        subject: 'owner',
        text: 'Sam is in Lisbon this week.',
        quote: 'in Lisbon this week',
        sourceID: 3,
        until: '2026-10-25T23:59:59+00:00',
      },
    },
  });
});

test('it builds a call with the subject the call names', () => {
  expect(
    buildRememberReply({
      subject: 'shared',
      text: 'Sam and Wren swap a riddle every Monday.',
      quote: 'a riddle every Monday',
      sourceID: 3,
    }),
  ).toStrictEqual({
    toolUse: {
      name: 'memory.remember',
      input: {
        subject: 'shared',
        text: 'Sam and Wren swap a riddle every Monday.',
        quote: 'a riddle every Monday',
        sourceID: 3,
      },
    },
  });
});
