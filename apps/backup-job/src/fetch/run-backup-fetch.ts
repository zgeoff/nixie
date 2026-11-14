import { join } from 'node:path';
import type { FetchedCopy, FetchedPair, PairRelation } from '@heynixie/wire';
import { fetchedPairFile, formatBackupFile, unfinishedBackupMarker } from '@heynixie/wire';
import type { JobFiles } from '../local-job-files';
import type { PublishedSnapshot } from '../publish/backup-repository';
import { pickNewestKey } from '../publish/pick-newest-key';
import type { BackupRepos } from '../publish/publish-backup-set';
import type { PairRefusal } from './pick-backup-pair';
import { fetchRepickLimit, pickBackupPair } from './pick-backup-pair';

export interface FetchFiles extends Pick<JobFiles, 'writeFile' | 'removeFile'> {
  readonly createDirectory: (path: string) => Promise<void>;

  // null: the directory does not exist
  readonly readDirectory: (path: string) => Promise<readonly string[] | null>;
}

export interface BackupFetchRequest {
  readonly repos: BackupRepos;
  readonly files: FetchFiles;
  readonly directory: string;
  readonly dataSnapshotID: string | null;
  readonly now: () => number;
}

export type BackupFetch =
  | { readonly status: 'fetched'; readonly pair: FetchedPair }
  | { readonly status: 'failed'; readonly step: string; readonly refusal?: PairRefusal };

// The marker goes first and comes off last, so a failure at any step leaves the directory marked
// and nixie refuses it. A publish that lands during the copies changes the newest key snapshot, and
// the fetch then starts the copies again.
export async function runBackupFetch(request: BackupFetchRequest): Promise<BackupFetch> {
  let step = 'directory';

  try {
    const existing = await request.files.readDirectory(request.directory);

    if (existing !== null && existing.length > 0) {
      return { status: 'failed', step };
    }

    await request.files.createDirectory(request.directory);

    step = 'marker';

    await request.files.writeFile(join(request.directory, unfinishedBackupMarker), '');

    for (let attempt = 0; attempt <= fetchRepickLimit; attempt += 1) {
      step = 'list';

      const [keys, data] = await Promise.all([
        request.repos.keys.readSnapshots(),
        request.repos.data.readSnapshots(),
      ]);

      const pick = pickBackupPair(keys, data, request.dataSnapshotID);

      if ('refused' in pick) {
        return { status: 'failed', step: 'pick', refusal: pick.refused };
      }

      step = 'copy-key';

      await request.repos.keys.restoreSnapshot(pick.key.snapshotID, request.directory);

      step = 'copy-data';

      await request.repos.data.restoreSnapshot(pick.data.snapshotID, request.directory);

      step = 'relist';

      const relisted = await request.repos.keys.readSnapshots();

      const newest = pickNewestKey(relisted);

      if (newest?.snapshotID === pick.key.snapshotID) {
        const pair = buildFetchedPair(pick, request.now());

        step = 'write';

        await request.files.writeFile(
          join(request.directory, fetchedPairFile),
          formatBackupFile(pair),
        );

        step = 'finish';

        await request.files.removeFile(join(request.directory, unfinishedBackupMarker));

        return { status: 'fetched', pair };
      }

      if (attempt === fetchRepickLimit) {
        return { status: 'failed', step: 'pick' };
      }

      step = 'empty';

      await emptyDirectory(request.files, request.directory);
    }

    return { status: 'failed', step: 'pick' };
  } catch {
    return { status: 'failed', step };
  }
}

interface BackupPair {
  readonly key: PublishedSnapshot;
  readonly data: PublishedSnapshot;
  readonly relation: PairRelation;
}

function buildFetchedPair(pick: BackupPair, fetchedAt: number): FetchedPair {
  return {
    format: 1,
    fetchedAt,
    key: toFetchedCopy(pick.key),
    data: toFetchedCopy(pick.data),
    relation: pick.relation,
  };
}

function toFetchedCopy(snapshot: PublishedSnapshot): FetchedCopy {
  return {
    snapshotID: snapshot.snapshotID,
    publish: snapshot.publish,
    set: snapshot.set,
    writtenAt: snapshot.writtenAt,
  };
}

async function emptyDirectory(files: FetchFiles, directory: string): Promise<void> {
  const listed = await files.readDirectory(directory);

  const names = listed ?? [];

  for (const name of names.filter((entry) => entry !== unfinishedBackupMarker)) {
    await files.removeFile(join(directory, name));
  }
}
