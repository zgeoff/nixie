import { expect, test } from 'bun:test';
import { seedFailedBackupNotice } from '@heynixie/backup/test-utils';
import { localDataStorage } from '@heynixie/log';
import { defaultAPISettings } from './default-api-settings';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

test('#backups.readNotice reads no notice before any backup set stages', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');
  const read = await buildTestClient(api.url, laptop.token).backups.readNotice();

  expect(read).toStrictEqual({ notice: null });
});

test('#backups.readNotice reads the notice that a failed receipt raised', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const notice = await seedFailedBackupNotice(
    { writer: api.writer, storage: localDataStorage },
    { failure: 'data: backup exited 1' },
  );

  const read = await buildTestClient(api.url, laptop.token).backups.readNotice();

  expect(read).toStrictEqual({
    notice: { cause: 'failed', sequence: notice.sequence, raisedAt: new Date(notice.raisedAt) },
  });
});

test('#backups.readNotice reads no notice when the deployment turns backups off', async () => {
  const api = await startTestAPI({ ...defaultAPISettings, isBackupEnabled: false });
  const laptop = await createDeviceSession(api.context, 'laptop');

  await seedFailedBackupNotice(
    { writer: api.writer, storage: localDataStorage },
    { failure: 'data: backup exited 1' },
  );

  const read = await buildTestClient(api.url, laptop.token).backups.readNotice();

  expect(read).toStrictEqual({ notice: null });
});

test('#backups.readNotice refuses a caller with no session', async () => {
  const api = await startTestAPI();

  const read = buildTestClient(api.url).backups.readNotice();

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
