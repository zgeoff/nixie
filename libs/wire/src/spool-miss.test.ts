import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { spoolMissSchema } from './spool-miss';

test('it accepts the committed miss', async () => {
  const miss = await Bun.file(
    join(import.meta.dir, '..', 'turn-input-formats', '1', 'spool-miss.json'),
  ).json();

  expect(spoolMissSchema.safeParse(miss).success).toBeTrue();
});

test.each([
  ['an unknown reason', { reason: 'disk_on_fire' }],
  ['a counter of 0', { counter: 0 }],
  ['an uppercase writer', { writer: 'AB' }],
  ['a version of 2', { version: 2 }],
  ['an extra key', { extra: 1 }],
])('it refuses a miss with %s', (_title, change) => {
  const miss = {
    version: 1,
    captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3',
    writer: 'ab',
    counter: 1,
    reason: 'queue_full',
    ...change,
  };

  expect(spoolMissSchema.safeParse(miss).success).toBeFalse();
});
