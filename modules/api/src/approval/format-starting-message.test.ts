import { expect, test } from 'bun:test';
import type { WakeCause } from '@heynixie/tasks';
import { formatStartingMessage } from './format-starting-message';

test.each<{ title: string; cause: WakeCause | null; name: string }>([
  { title: 'your message', cause: { kind: 'owner' }, name: 'Your message' },
  { title: 'outside content', cause: { kind: 'event' }, name: 'Outside content' },
  { title: 'a timer', cause: { kind: 'timer' }, name: 'A timer' },
  {
    title: 'a message from a task',
    cause: { kind: 'task', taskID: 'a1' },
    name: 'A message from a task',
  },
  { title: 'an earlier message', cause: { kind: 'carried' }, name: 'An earlier message' },
  { title: 'a step that recorded no cause', cause: null, name: 'Conversation' },
])('#formatStartingMessage names $title', (row) => {
  expect(formatStartingMessage(row.cause)).toBe(row.name);
});
