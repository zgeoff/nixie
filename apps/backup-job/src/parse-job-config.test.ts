import { expect, test } from 'bun:test';
import { parseJobConfig } from './parse-job-config';

test('it reads both repos, and keeps 24 hourly, 7 daily, 4 weekly and 6 monthly data snapshots by default', () => {
  expect(
    parseJobConfig({
      NIXIE_BACKUP_DATA_REPOSITORY: 's3:https://backups.example.test/data',
      NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
      NIXIE_BACKUP_KEY_REPOSITORY: 's3:https://backups.example.test/keys',
      NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
      AWS_ACCESS_KEY_ID: 'access-a',
      PATH: '/usr/bin',
    }),
  ).toStrictEqual({
    stagingDir: '/backup',
    restic: 'restic',
    pollMs: 60_000,
    data: { repository: 's3:https://backups.example.test/data', password: 'data-pass' },
    keys: { repository: 's3:https://backups.example.test/keys', password: 'key-pass' },
    retention: { hourly: 24, daily: 7, weekly: 4, monthly: 6 },
    backendEnv: { AWS_ACCESS_KEY_ID: 'access-a', PATH: '/usr/bin' },
  });
});

test('it reads the retention and the poll interval the job sets', () => {
  const config = parseJobConfig({
    NIXIE_BACKUP_DATA_REPOSITORY: '/repos/data',
    NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
    NIXIE_BACKUP_KEY_REPOSITORY: '/repos/keys',
    NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
    NIXIE_BACKUP_KEEP_HOURLY: '48',
    NIXIE_BACKUP_KEEP_MONTHLY: '12',
    NIXIE_BACKUP_POLL_SECONDS: '30',
  });

  expect(config.retention).toStrictEqual({ hourly: 48, daily: 7, weekly: 4, monthly: 12 });
  expect(config.pollMs).toBe(30_000);
});

test('it refuses one repository for both the data and the keys', () => {
  expect(() =>
    parseJobConfig({
      NIXIE_BACKUP_DATA_REPOSITORY: '/repos/shared',
      NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
      NIXIE_BACKUP_KEY_REPOSITORY: '/repos/shared',
      NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
    }),
  ).toThrow(/needs a repository of its own/u);
});

test('it refuses a job with no key repo', () => {
  expect(() =>
    parseJobConfig({
      NIXIE_BACKUP_DATA_REPOSITORY: '/repos/data',
      NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
    }),
  ).toThrow(/NIXIE_BACKUP_KEY_REPOSITORY/u);
});

test('it passes restic no password or repository variable of its own, so each repo opens with its own', () => {
  const config = parseJobConfig({
    NIXIE_BACKUP_DATA_REPOSITORY: '/repos/data',
    NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
    NIXIE_BACKUP_KEY_REPOSITORY: '/repos/keys',
    NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
    RESTIC_PASSWORD_FILE: '/run/secrets/one-password',
    RESTIC_REPOSITORY: '/repos/other',
    RESTIC_COMPRESSION: 'max',
  });

  expect(config.backendEnv).toStrictEqual({ RESTIC_COMPRESSION: 'max' });
});
