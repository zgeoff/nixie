import { expect, test } from 'bun:test';
import type { StartingMessage } from './format-starting-message';
import { formatStartingMessage } from './format-starting-message';

test.each<{ title: string; starting: StartingMessage; name: string }>([
  {
    title: 'your message by its text',
    starting: { cause: { kind: 'owner' }, ownerText: 'Book a ferry' },
    name: 'Your message: Book a ferry',
  },
  {
    title: 'another message of yours apart from the first',
    starting: { cause: { kind: 'owner' }, ownerText: 'Find a cabin' },
    name: 'Your message: Find a cabin',
  },
  {
    title: 'a long message cut to its first 60 characters',
    starting: { cause: { kind: 'owner' }, ownerText: `${'a'.repeat(60)} and more` },
    name: `Your message: ${'a'.repeat(60)}…`,
  },
  {
    title: 'a message of several lines on one line',
    starting: { cause: { kind: 'owner' }, ownerText: 'Book a ferry\n\nfor  two' },
    name: 'Your message: Book a ferry for two',
  },
  {
    title: 'your message whose text a forget erased',
    starting: { cause: { kind: 'owner' }, ownerText: null },
    name: 'Your message',
  },
  {
    title: 'outside content',
    starting: { cause: { kind: 'event' }, ownerText: null },
    name: 'Outside content',
  },
  {
    title: 'a timer',
    starting: { cause: { kind: 'timer' }, ownerText: null },
    name: 'A timer',
  },
  {
    title: 'a message from a task',
    starting: { cause: { kind: 'task', taskID: 'a1' }, ownerText: null },
    name: 'A message from a task',
  },
  {
    title: 'an earlier message',
    starting: { cause: { kind: 'carried' }, ownerText: null },
    name: 'An earlier message',
  },
  {
    title: 'a step that recorded no cause',
    starting: { cause: null, ownerText: null },
    name: 'Conversation',
  },
])('#formatStartingMessage names $title', (row) => {
  expect(formatStartingMessage(row.starting)).toBe(row.name);
});
