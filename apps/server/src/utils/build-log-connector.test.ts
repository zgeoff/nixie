import { expect, mock, test } from 'bun:test';
import { buildLogConnector } from './build-log-connector';

test('it writes one log line with the action ID and the attempt, and reports success', async () => {
  const log = mock(() => {});

  const response = await buildLogConnector(log).connector.run({
    actionID: 'action-7',
    tool: 'actions.log',
    arguments: { wake: 12 },
    attempt: 2,
    idempotencyKey: 'action-7',
  });

  expect(log).toHaveBeenCalledExactlyOnceWith('action.logged', {
    actionID: 'action-7',
    attempt: 2,
  });

  expect(response).toStrictEqual({ kind: 'success', result: { logged: true } });
});

test('it declares a queued tool that takes the sequence of a wake, whose one write the registry accepts', () => {
  const connector = buildLogConnector(() => {});

  expect(connector.tool).toMatchObject({
    name: 'actions.log',
    execution: 'queued',
    input: {
      type: 'object',
      properties: { wake: { type: 'integer', minimum: 1 } },
      required: ['wake'],
      additionalProperties: false,
    },
    declaration: { effects: ['write'], destinations: [], content: [] },
  });
});
