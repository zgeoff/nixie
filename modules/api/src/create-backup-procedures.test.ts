import { expect, test } from 'bun:test';
import { defaultAPISettings } from './default-api-settings';
import { buildSeeder } from './test-utils/build-seeder';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

async function setupTest(settings?: Parameters<typeof startTestAPI>[0]) {
  const api = await startTestAPI(settings);

  return { ...api, seed: buildSeeder(api) };
}

test('#backups.readNotice reads no notice before any backup set stages', async () => {
  const api = await setupTest();
  const laptop = await createDeviceSession(api.context, 'laptop');
  const read = await buildTestClient(api.url, laptop.token).backups.readNotice();

  expect(read).toStrictEqual({ notice: null });
});

test('#backups.readNotice reads the notice that a failed receipt raised', async () => {
  const api = await setupTest();
  const laptop = await createDeviceSession(api.context, 'laptop');
  const notice = await api.seed.failedBackupNotice({ failure: 'data: backup exited 1' });
  const read = await buildTestClient(api.url, laptop.token).backups.readNotice();

  expect(read).toStrictEqual({
    notice: { cause: 'failed', sequence: notice.sequence, raisedAt: new Date(notice.raisedAt) },
  });
});

test('#backups.readNotice reads no notice when the deployment turns backups off', async () => {
  const api = await setupTest({ ...defaultAPISettings, isBackupEnabled: false });
  const laptop = await createDeviceSession(api.context, 'laptop');

  await api.seed.failedBackupNotice({ failure: 'data: backup exited 1' });

  const read = await buildTestClient(api.url, laptop.token).backups.readNotice();

  expect(read).toStrictEqual({ notice: null });
});

test('#backups.readNotice refuses a caller with no session', async () => {
  const api = await setupTest();

  const read = buildTestClient(api.url).backups.readNotice();

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
