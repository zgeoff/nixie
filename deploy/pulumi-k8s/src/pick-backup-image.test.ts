import { expect, test } from 'bun:test';
import { pickBackupImage } from './pick-backup-image';

test("it runs the release's own nixie-backup image when the deployment names none", () => {
  expect(
    pickBackupImage(
      undefined,
      'ghcr.io/example/nixie-backup:1.2.3@sha256:4444444444444444444444444444444444444444444444444444444444444444',
    ),
  ).toBe(
    'ghcr.io/example/nixie-backup:1.2.3@sha256:4444444444444444444444444444444444444444444444444444444444444444',
  );
});

test('it runs the image the deployment names over the release one', () => {
  expect(
    pickBackupImage(
      'ghcr.io/example/backup:1.0.0@sha256:3333333333333333333333333333333333333333333333333333333333333333',
      'ghcr.io/example/nixie-backup:1.2.3@sha256:4444444444444444444444444444444444444444444444444444444444444444',
    ),
  ).toBe(
    'ghcr.io/example/backup:1.0.0@sha256:3333333333333333333333333333333333333333333333333333333333333333',
  );
});

test('it refuses a backup with no image in a build that carries no release image', () => {
  expect(() => pickBackupImage(undefined, null)).toThrowWithMessage(
    Error,
    'this build of the component carries no nixie-backup image, so backup.image names one',
  );
});
