import { expect, test } from 'bun:test';
import { buildVersionStatus } from './build-version-status';

test('it reads the nixie version that opened the session', async () => {
  const line = await buildVersionStatus('0.12.0').read({
    start: { kind: 'first' },
    openedAt: new Date('2026-10-14T11:50:00Z'),
    times: { defaultZone: 'UTC', now: new Date('2026-10-14T11:50:00Z') },
    model: 'claude-test-1',
  });

  expect(line).toStrictEqual({ value: '0.12.0', text: 'nixie version: 0.12.0' });
});
