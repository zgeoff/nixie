import { expect, test } from 'bun:test';
import { findCredentialBreach } from './find-credential-breach.ts';

test('it finds no breach when only the backup service holds the backup variables and mounts only staging', () => {
  expect(
    findCredentialBreach({
      services: {
        nixie: { environment: { NIXIE_ORIGIN: 'http://127.0.0.1:8080' } },
        'nixie-backup': {
          environment: { NIXIE_BACKUP_DATA_PASSWORD: 'data-pass' },
          volumes: [{ source: 'data', target: '/backup', volume: { subpath: 'backup' } }],
        },
      },
    }),
  ).toBeNull();
});

test('it finds a backup variable in the nixie service', () => {
  expect(
    findCredentialBreach({
      services: {
        nixie: { environment: { NIXIE_BACKUP_KEY_PASSWORD: 'key-pass' } },
        'nixie-backup': {
          volumes: [{ source: 'data', target: '/backup', volume: { subpath: 'backup' } }],
        },
      },
    }),
  ).toBe('the nixie service holds a backup variable');
});

test('it finds the secrets volume mounted in the backup service', () => {
  expect(
    findCredentialBreach({
      services: {
        nixie: { environment: {} },
        'nixie-backup': {
          volumes: [
            { source: 'data', target: '/backup', volume: { subpath: 'backup' } },
            { source: 'secrets', target: '/secrets' },
          ],
        },
      },
    }),
  ).toBe('the nixie-backup service mounts the secrets volume');
});

test('it finds the whole data volume mounted in the backup service', () => {
  expect(
    findCredentialBreach({
      services: {
        nixie: { environment: {} },
        'nixie-backup': { volumes: [{ source: 'data', target: '/backup' }] },
      },
    }),
  ).toBe('the nixie-backup service mounts more than the staging subpath of data');
});

test('it finds a second mount beside staging in the backup service', () => {
  expect(
    findCredentialBreach({
      services: {
        nixie: { environment: {} },
        'nixie-backup': {
          volumes: [
            { source: 'data', target: '/backup', volume: { subpath: 'backup' } },
            { source: 'cache', target: '/cache' },
          ],
        },
      },
    }),
  ).toBe('the nixie-backup service mounts more than the staging subpath of data');
});

test('it finds a backup service with no mount', () => {
  expect(
    findCredentialBreach({ services: { nixie: { environment: {} }, 'nixie-backup': {} } }),
  ).toBe('the nixie-backup service mounts more than the staging subpath of data');
});
