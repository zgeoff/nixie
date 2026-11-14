import { join } from 'node:path';
import type { BackupReceipt, BackupSetEntry, BackupSetManifest } from '@heynixie/wire';
import {
  backupSetLayout,
  backupSetManifestSchema,
  parseBackupFile,
  restoreNoteSchema,
} from '@heynixie/wire';
import type { JobFiles } from '../local-job-files';
import type { DataRetention, JobConfig } from '../parse-job-config';
import type { SnapshotTagValues } from '../restic/format-snapshot-tags';
import { formatSnapshotTags } from '../restic/format-snapshot-tags';
import { ResticError } from '../restic/restic-error';
import type { BackupRepository, PublishedSnapshot } from './backup-repository';
import { pickNewestKey } from './pick-newest-key';

export interface BackupRepos {
  readonly data: BackupRepository;
  readonly keys: BackupRepository;
}

export type PublishConfig = Pick<JobConfig, 'stagingDir' | 'retention'>;

type PublishFiles = Pick<JobFiles, 'readText' | 'readFileSHA256' | 'removeFile'>;

interface PublishCount {
  readonly publish: number;
  readonly previous: PublishedSnapshot | null;
  readonly hasPublishNumber: boolean;
}

type PublishCountRead = PublishCount | { readonly refused: string };

// A failure that restic reports becomes a failed receipt, which nixie records and reports; any
// other failure leaves the set without a receipt, so the next run publishes it again.
export async function publishBackupSet(
  repos: BackupRepos,
  config: PublishConfig,
  files: PublishFiles,
  set: BackupSetEntry,
): Promise<BackupReceipt> {
  const verified = await readVerifiedManifest(files, set);

  if ('refused' in verified) {
    return buildFailedReceipt(set, verified.refused);
  }

  const counted = await readPublishCount(repos).catch((error: unknown): PublishCountRead => ({
    refused: requireResticFailure(error),
  }));

  if ('refused' in counted) {
    return buildFailedReceipt(set, counted.refused);
  }

  const notePath = join(config.stagingDir, backupSetLayout.restoreNote);

  const note = await readRestoreNote(files, notePath);

  const keyTags = formatSnapshotTags({
    set: set.sequence,
    kind: verified.manifest.kind,
    publish: counted.publish,
    ...pickKeyTagValues(counted, note),
  });

  const keySnapshotID = await repos.keys
    .writeSnapshot(join(set.directory, 'keys.db'), 'keys.db', keyTags)
    .catch((error: unknown) => ({ refused: requireResticFailure(error) }));

  if (typeof keySnapshotID !== 'string') {
    return buildFailedReceipt(set, keySnapshotID.refused);
  }

  const failures: string[] = [];

  const dataTags = formatSnapshotTags({
    set: set.sequence,
    kind: verified.manifest.kind,
    publish: counted.publish,
    legacySet: null,
    provenFrom: null,
  });

  const dataSnapshotID = await writeDataSnapshot(repos.data, config.retention, set, dataTags).catch(
    (error: unknown) => {
      failures.push(requireResticFailure(error));

      return null;
    },
  );

  const keys = await removeOtherKeySnapshots(repos.keys, keySnapshotID, failures);

  if (note !== null) {
    await files.removeFile(notePath).catch((error: unknown) => {
      if (!isMissingFileError(error)) {
        throw error;
      }
    });
  }

  return buildReceipt({
    sequence: set.sequence,
    writtenAt: Date.now(),
    dataSnapshotID,
    keys,
    failures,
  });
}

type VerifiedManifest = { readonly manifest: BackupSetManifest } | { readonly refused: string };

async function readVerifiedManifest(
  files: PublishFiles,
  set: BackupSetEntry,
): Promise<VerifiedManifest> {
  const text = await files.readText(join(set.directory, backupSetLayout.manifest));

  const parsed = parseBackupFile(text, backupSetManifestSchema);

  if ('refused' in parsed) {
    return { refused: `the manifest of set ${String(set.sequence)}: ${parsed.refused}` };
  }

  if (parsed.value.sequence !== set.sequence) {
    return {
      refused: `the manifest names set ${String(parsed.value.sequence)}, and it sits in the directory of set ${String(set.sequence)}`,
    };
  }

  for (const copy of parsed.value.copies) {
    const digest = await files.readFileSHA256(join(set.directory, copy.name));

    if (digest.sha256 !== copy.sha256 || digest.bytes !== copy.bytes) {
      return {
        refused: `the ${copy.name} copy of set ${String(set.sequence)} does not match the checksum its manifest records`,
      };
    }
  }

  return { manifest: parsed.value };
}

type StepResult = BackupReceipt['prune'];

interface KeyPublication {
  readonly keySnapshotID: string | null;
  readonly removedKeySnapshotIDs: readonly string[];
  readonly prune: StepResult;
  readonly check: StepResult;
}

const emptyKeyPublication: KeyPublication = {
  keySnapshotID: null,
  removedKeySnapshotIDs: [],
  prune: 'not-run',
  check: 'not-run',
};

function buildFailedReceipt(set: BackupSetEntry, failure: string): BackupReceipt {
  return buildReceipt({
    sequence: set.sequence,
    writtenAt: Date.now(),
    dataSnapshotID: null,
    keys: emptyKeyPublication,
    failures: [failure],
  });
}

interface ReceiptParts {
  readonly sequence: number;
  readonly writtenAt: number;
  readonly dataSnapshotID: string | null;
  readonly keys: KeyPublication;
  readonly failures: readonly string[];
}

function buildReceipt(parts: ReceiptParts): BackupReceipt {
  return {
    format: 1,
    sequence: parts.sequence,
    writtenAt: parts.writtenAt,
    status: parts.failures.length === 0 ? 'published' : 'failed',
    dataSnapshotID: parts.dataSnapshotID,
    keySnapshotID: parts.keys.keySnapshotID,
    removedKeySnapshotIDs: parts.keys.removedKeySnapshotIDs,
    prune: parts.keys.prune,
    check: parts.keys.check,
    failure: parts.failures.length === 0 ? null : parts.failures.join('; '),
  };
}

// A publish number never repeats. A key repo that cannot be listed stops the publish. A data repo
// that cannot be listed leaves the count to the key repo, and stops the publish only when the key
// repo then holds no number.
async function readPublishCount(repos: BackupRepos): Promise<PublishCountRead> {
  await repos.keys.createRepository();

  const keyList = await repos.keys.readSnapshots();

  const dataList = await repos.data
    .createRepository()
    .then(() => repos.data.readSnapshots())
    .catch((error: unknown) => ({ refused: requireResticFailure(error) }));

  const listed = 'refused' in dataList ? keyList : [...keyList, ...dataList];
  const highest = Math.max(0, ...listed.map((snapshot) => snapshot.publish ?? 0));

  if ('refused' in dataList && highest === 0) {
    return dataList;
  }

  return {
    publish: highest + 1,
    previous: pickNewestKey(keyList),
    hasPublishNumber: highest > 0,
  };
}

function requireResticFailure(error: unknown): string {
  if (error instanceof ResticError) {
    return error.message;
  }

  throw error;
}

interface RestoreNoteRead {
  readonly keySnapshotID: string | null;
}

// A note that does not parse reads as one that names no key snapshot.
async function readRestoreNote(files: PublishFiles, path: string): Promise<RestoreNoteRead | null> {
  const text = await files.readText(path).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  });

  if (text === null) {
    return null;
  }

  const parsed = parseBackupFile(text, restoreNoteSchema);

  return { keySnapshotID: 'value' in parsed ? parsed.value.keySnapshotID : null };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

type KeyTagValues = Pick<SnapshotTagValues, 'legacySet' | 'provenFrom'>;

function pickKeyTagValues(count: PublishCount, note: RestoreNoteRead | null): KeyTagValues {
  const previous = count.previous;

  if (
    note !== null &&
    (note.keySnapshotID === null || note.keySnapshotID !== previous?.snapshotID)
  ) {
    return { legacySet: null, provenFrom: count.publish };
  }

  if (previous === null) {
    return { legacySet: null, provenFrom: null };
  }

  if (previous.publish === null) {
    return count.hasPublishNumber
      ? { legacySet: null, provenFrom: count.publish }
      : { legacySet: previous.set, provenFrom: null };
  }

  return { legacySet: previous.legacySet, provenFrom: previous.provenFrom };
}

async function writeDataSnapshot(
  data: BackupRepository,
  retention: DataRetention,
  set: BackupSetEntry,
  tags: readonly string[],
): Promise<string> {
  const snapshotID = await data.writeSnapshot(join(set.directory, 'nixie.db'), 'nixie.db', tags);

  await data.runRetention(retention);

  return snapshotID;
}

// The key repo keeps the new snapshot alone, whatever host or path an older one names, and prunes
// every unused byte, because a snapshot's removal alone leaves its blobs readable.
async function removeOtherKeySnapshots(
  keys: BackupRepository,
  keySnapshotID: string,
  failures: string[],
): Promise<KeyPublication> {
  const removed = await keys
    .readSnapshots()
    .then(async (snapshots) => {
      const others = snapshots
        .map((snapshot) => snapshot.snapshotID)
        .filter((snapshotID) => snapshotID !== keySnapshotID);

      await keys.removeSnapshots(others);

      return others;
    })
    .catch((error: unknown) => {
      failures.push(requireResticFailure(error));

      return null;
    });

  if (removed === null) {
    return { ...emptyKeyPublication, keySnapshotID };
  }

  const prune = await runStep(keys.runPrune, failures);

  const check = prune === 'passed' ? await runStep(keys.runCheck, failures) : 'not-run';

  return { keySnapshotID, removedKeySnapshotIDs: removed, prune, check };
}

async function runStep(step: () => Promise<void>, failures: string[]): Promise<StepResult> {
  try {
    await step();

    return 'passed';
  } catch (error) {
    failures.push(requireResticFailure(error));

    return 'failed';
  }
}
