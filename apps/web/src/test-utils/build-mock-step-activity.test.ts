import { expect, test } from 'bun:test';
import { buildMockStepActivity } from './build-mock-step-activity';

test('it builds a default step activity', () => {
  expect(buildMockStepActivity()).toStrictEqual({
    calls: [],
    key: expect.toBeWithin(1, 1_000_001),
    kind: 'step',
    records: [],
    status: 'done',
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockStepActivity({
      calls: [{ callID: 'a', input: { url: 'https://example.com/' }, tool: 'web_fetch' }],
      status: 'running',
      taskID: 'conversation',
    }),
  ).toStrictEqual({
    calls: [{ callID: 'a', input: { url: 'https://example.com/' }, tool: 'web_fetch' }],
    key: expect.toBeWithin(1, 1_000_001),
    kind: 'step',
    records: [],
    status: 'running',
    taskID: 'conversation',
  });
});
