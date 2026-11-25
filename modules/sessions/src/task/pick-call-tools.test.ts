import { expect, test } from 'bun:test';
import { pickCallTools } from './pick-call-tools';

test('it keeps the conversation connectors and drops the tools that start work, ring or report', () => {
  const tools = pickCallTools([
    'calendar.list_events',
    'web.search',
    'call.ring',
    'task.start',
    'task.message',
    'worker.run',
    'task.report',
    'time.now',
  ]);

  expect(tools).toStrictEqual(['calendar.list_events', 'web.search', 'task.message', 'time.now']);
});
