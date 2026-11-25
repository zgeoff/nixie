import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import { createHeldTestStore } from './create-held-test-store';
import { startCredentialTestLog } from './start-credential-test-log';

test('it builds a store whose database credentials register against its backend', async () => {
  const clock = createFakeClock({ startMs: Date.parse('2026-10-16T09:00:00Z') });

  const testLog = await startCredentialTestLog({ clock });
  const held = await createHeldTestStore({ log: testLog.log, ca: '', now: clock.now });

  await held.backend.remove('credential');

  const binding = await held.store.register(
    { backend: 'database', credentialID: 'credential' },
    { kind: 'oauth_token', label: 'Example account', origins: [] },
  );

  expect(binding.removalCounter).toBe(1);
});
