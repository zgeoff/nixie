import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import { buildToolRegistry } from '@heynixie/tools';
import type { ToolCall, ToolContext } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildTimeTool } from './build-time-tool';

const call: ToolCall = { callID: 'call-1', tool: 'time.now', input: {}, toolUseID: null };

const context: ToolContext = {
  run: {
    runID: 'run-1',
    thread: 'conversation',
    tools: ['time.now'],
    model: { model: 'model-a', profile: 'chat-direct' },
  },
};

test('it answers in the zone of the newest message', async () => {
  const tool = buildTimeTool({
    clock: buildTestClock(Date.parse('2026-10-13T22:30:15.000Z')),
    findTimeZone: () => Promise.resolve('Europe/London'),
    defaultZone: 'Australia/Sydney',
  });

  const outcome = await tool.run(call, context);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      utc: '2026-10-13T22:30:15.000Z',
      local: '2026-10-13T23:30:15+01:00',
      weekday: 'Tuesday',
      timeZone: 'Europe/London',
      timeZoneFrom: 'message',
    },
  });
});

test('it answers in the configured default zone when no message carries a zone', async () => {
  const tool = buildTimeTool({
    clock: buildTestClock(Date.parse('2026-10-13T22:30:15.000Z')),
    findTimeZone: () => Promise.resolve(null),
    defaultZone: 'Australia/Sydney',
  });

  const outcome = await tool.run(call, context);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      utc: '2026-10-13T22:30:15.000Z',
      local: '2026-10-14T09:30:15+11:00',
      weekday: 'Wednesday',
      timeZone: 'Australia/Sydney',
      timeZoneFrom: 'default',
    },
  });
});

test('it gives a zone at UTC itself an offset of +00:00', async () => {
  const tool = buildTimeTool({
    clock: buildTestClock(Date.parse('2026-01-05T08:00:00.000Z')),
    findTimeZone: () => Promise.resolve('Atlantic/Reykjavik'),
    defaultZone: 'Australia/Sydney',
  });

  const outcome = await tool.run(call, context);

  invariant(outcome.status === 'ok');
  expect(outcome.result['local']).toBe('2026-01-05T08:00:00+00:00');
});

test('it passes the registry rules, with a result the output schema accepts', async () => {
  const tool = buildTimeTool({
    clock: buildTestClock(Date.parse('2026-10-13T22:30:15.000Z')),
    findTimeZone: () => Promise.resolve(null),
    defaultZone: 'Australia/Sydney',
  });
  const registered = buildToolRegistry([tool]).findTool('time.now');

  invariant(registered);
  const outcome = await tool.run(call, context);

  invariant(outcome.status === 'ok');
  expect(registered.parseInput({})).toStrictEqual({ isValid: true });
  expect(registered.parseOutput(outcome.result)).toStrictEqual({ isValid: true });
});
