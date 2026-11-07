import { expect, test } from 'bun:test';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { BackupNotice } from './backup-notice';

test('it shows the notice of a failed backup', async () => {
  await createDeviceSession();

  await store.backupNotices.create({
    cause: 'failed',
    sequence: 7,
    raisedAt: new Date('2026-11-02T08:00:00Z'),
  });

  const rendered = render(<BackupNotice />);

  const notice = await rendered.findByRole('alert');

  expect(notice).toHaveTextContent(
    /^nixie found a failed backup at .+\. nixie keeps its data, and the next backup tries again within the backup interval\.$/u,
  );
});

test('it shows the notice of a backup with no upload within the interval', async () => {
  await createDeviceSession();

  await store.backupNotices.create({
    cause: 'missing',
    sequence: 7,
    raisedAt: new Date('2026-11-02T08:00:00Z'),
  });

  const rendered = render(<BackupNotice />);

  const notice = await rendered.findByRole('alert');

  expect(notice).toHaveTextContent(
    /^nixie found at .+ that a backup had not uploaded within the backup interval\. Check that the backup job runs\.$/u,
  );
});
