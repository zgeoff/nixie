import type { PairRelation } from '@heynixie/wire';
import type { PublishedSnapshot } from '../publish/backup-repository';
import { pickNewestKey } from '../publish/pick-newest-key';

export const fetchRepickLimit = 3;

export type PairRefusal =
  | 'no-key-snapshot'
  | 'no-data-of-publish'
  | 'duplicate-publish'
  | 'no-such-data-snapshot'
  | 'data-newer-than-keys'
  | 'data-unproven';

export type BackupPairPick =
  | { key: PublishedSnapshot; data: PublishedSnapshot; relation: PairRelation }
  | { refused: PairRefusal; message: string };

export function pickBackupPair(
  keys: readonly PublishedSnapshot[],
  data: readonly PublishedSnapshot[],
  dataSnapshotID: string | null,
): BackupPairPick {
  const key = pickNewestKey(keys);

  if (key === null) {
    return { refused: 'no-key-snapshot', message: 'the key repository holds no key snapshot' };
  }

  if (dataSnapshotID !== null) {
    return pickNamedData(key, data, dataSnapshotID);
  }

  return pickDefaultData(key, data);
}

function pickNamedData(
  key: PublishedSnapshot,
  data: readonly PublishedSnapshot[],
  dataSnapshotID: string,
): BackupPairPick {
  const named = data.find((snapshot) => snapshot.snapshotID === dataSnapshotID);

  if (named === undefined) {
    return {
      refused: 'no-such-data-snapshot',
      message: 'the data repository holds no data snapshot with the ID that was named',
    };
  }

  const result = pickTableResult(key, named);

  if (result === 'data-newer-than-keys') {
    return {
      refused: result,
      message: `data snapshot ${named.snapshotID} is newer than key snapshot ${key.snapshotID}, so the key copy lacks keys that it may need`,
    };
  }

  if (result === 'data-unproven') {
    return {
      refused: result,
      message: `key snapshot ${key.snapshotID} does not vouch for data snapshot ${named.snapshotID}`,
    };
  }

  return { key, data: named, relation: result };
}

type TableResult = PairRelation | 'data-newer-than-keys' | 'data-unproven';

// A comparison with a number that a snapshot lacks does not hold.
function pickTableResult(key: PublishedSnapshot, named: PublishedSnapshot): TableResult {
  if (key.publish !== null) {
    return pickResultUnderNumberedKey(key, key.publish, named);
  }

  if (named.publish !== null || key.set === null || named.set === null) {
    return 'data-unproven';
  }

  if (named.set === key.set) {
    return 'same-publish';
  }

  return named.set < key.set ? 'older-data' : 'data-newer-than-keys';
}

function pickResultUnderNumberedKey(
  key: PublishedSnapshot,
  keyPublish: number,
  named: PublishedSnapshot,
): TableResult {
  if (named.publish !== null) {
    if (named.publish === keyPublish) {
      return 'same-publish';
    }

    if (named.publish > keyPublish) {
      return 'data-newer-than-keys';
    }

    return key.provenFrom !== null && named.publish < key.provenFrom
      ? 'data-unproven'
      : 'older-data';
  }

  const isAtOrBelowLegacy =
    named.set !== null && key.legacySet !== null && named.set <= key.legacySet;

  return isAtOrBelowLegacy && key.provenFrom === null ? 'older-data' : 'data-unproven';
}

function pickDefaultData(
  key: PublishedSnapshot,
  data: readonly PublishedSnapshot[],
): BackupPairPick {
  if (key.publish === null) {
    const [latest] = data
      .filter(
        (snapshot) =>
          snapshot.publish === null && snapshot.set !== null && snapshot.set === key.set,
      )
      .toSorted((left, right) => right.writtenAt - left.writtenAt);

    if (latest === undefined) {
      return refuseNoDataOfPublish(key, data);
    }

    return { key, data: latest, relation: 'same-publish' };
  }

  const matches = data.filter((snapshot) => snapshot.publish === key.publish);
  const [match, ...others] = matches;

  if (match === undefined) {
    return refuseNoDataOfPublish(key, data);
  }

  if (others.length > 0) {
    const ids = matches.map((snapshot) => snapshot.snapshotID).join(', ');

    return {
      refused: 'duplicate-publish',
      message: `data snapshots ${ids} all hold publish number ${String(key.publish)}`,
    };
  }

  return { key, data: match, relation: 'same-publish' };
}

// The data snapshot that the message names is the best the key copy could go with: the highest
// publish number among those it vouches for, or the latest by restic's time when none is numbered.
function refuseNoDataOfPublish(
  key: PublishedSnapshot,
  data: readonly PublishedSnapshot[],
): BackupPairPick {
  const [best] = data
    .filter((snapshot) => {
      const result = pickTableResult(key, snapshot);

      return result === 'same-publish' || result === 'older-data';
    })
    .toSorted(
      (left, right) =>
        (right.publish ?? 0) - (left.publish ?? 0) || right.writtenAt - left.writtenAt,
    );

  const named =
    best === undefined
      ? `no data snapshot can go with key snapshot ${key.snapshotID}`
      : `name data snapshot ${best.snapshotID} with --data-snapshot to restore the newest data that key snapshot ${key.snapshotID} vouches for`;

  return {
    refused: 'no-data-of-publish',
    message: `the data repository holds no data snapshot of key snapshot ${key.snapshotID}: ${named}`,
  };
}
