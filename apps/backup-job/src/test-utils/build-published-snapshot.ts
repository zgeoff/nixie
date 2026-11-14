import type { PublishedSnapshot } from '../publish/backup-repository';

export function buildPublishedSnapshot(overrides: Partial<PublishedSnapshot>): PublishedSnapshot {
  return {
    snapshotID: 'a'.repeat(64),
    writtenAt: 1000,
    set: null,
    kind: 'scheduled',
    publish: null,
    legacySet: null,
    provenFrom: null,
    ...overrides,
  };
}
