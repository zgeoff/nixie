import type { BackupSetKind } from '@heynixie/wire';
import type { PublishedSnapshot } from '../publish/backup-repository';
import type { BackupRepos } from '../publish/publish-backup-set';

// One line of JSON for each snapshot of both repositories, data first
export async function readSnapshotLines(repos: BackupRepos): Promise<readonly string[]> {
  const data = await repos.data.readSnapshots();
  const keys = await repos.keys.readSnapshots();

  return [
    ...data.map((snapshot) => formatSnapshotLine('data', snapshot)),
    ...keys.map((snapshot) => formatSnapshotLine('key', snapshot)),
  ];
}

interface SnapshotLine {
  readonly repository: 'data' | 'key';
  readonly snapshotID: string;
  readonly time: string;
  readonly set: number | null;
  readonly kind: BackupSetKind | null;
  readonly publish: number | null;
}

function formatSnapshotLine(repository: SnapshotLine['repository'], snapshot: PublishedSnapshot) {
  const line: SnapshotLine = {
    repository,
    snapshotID: snapshot.snapshotID,
    time: new Date(snapshot.writtenAt).toISOString(),
    set: snapshot.set,
    kind: snapshot.kind,
    publish: snapshot.publish,
  };

  return JSON.stringify(line);
}
