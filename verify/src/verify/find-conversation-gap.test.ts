import { expect, test } from 'bun:test';
import { findConversationGap } from './find-conversation-gap';

test('it finds no gap when the reply follows the message', () => {
  const records = [
    { event: 'record' as const, sequence: 12, kind: 'owner_message', text: 'Is the kettle on?' },
    {
      event: 'record' as const,
      sequence: 14,
      kind: 'model.reply',
      text: 'It boiled a minute ago.',
    },
  ];

  expect(
    findConversationGap(records, {
      message: 'Is the kettle on?',
      reply: 'It boiled a minute ago.',
    }),
  ).toBeNull();
});

test('it names the reply when it came before the message', () => {
  const records = [
    {
      event: 'record' as const,
      sequence: 10,
      kind: 'model.reply',
      text: 'It boiled a minute ago.',
    },
    { event: 'record' as const, sequence: 12, kind: 'owner_message', text: 'Is the kettle on?' },
  ];

  expect(
    findConversationGap(records, {
      message: 'Is the kettle on?',
      reply: 'It boiled a minute ago.',
    }),
  ).toBe('a model.reply record "It boiled a minute ago." after the owner\'s message');
});

test('it names the message when no record holds it', () => {
  expect(
    findConversationGap([], { message: 'Is the kettle on?', reply: 'It boiled a minute ago.' }),
  ).toBe('an owner_message record with the text "Is the kettle on?"');
});
