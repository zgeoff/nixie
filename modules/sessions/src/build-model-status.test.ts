import { expect, test } from 'bun:test';
import { buildModelStatus } from './build-model-status';

test('it reads the model from the conversation profile', async () => {
  const line = await buildModelStatus().read({
    start: { kind: 'first' },
    openedAt: new Date('2026-10-14T11:50:00Z'),
    times: { defaultZone: 'UTC', now: new Date('2026-10-14T11:50:00Z') },
    model: 'claude-test-1',
  });

  expect(line).toStrictEqual({ value: 'claude-test-1', text: 'Model: claude-test-1' });
});
