import { join } from 'node:path';
import type {
  BackupFileReads,
  BackupReceipt,
  BackupSetEntry,
  BackupSetManifest,
} from '@heynixie/wire';
import { backupSetLayout, backupSetManifestSchema, parseBackupFile } from '@heynixie/wire';
import type { ResticClient } from './build-restic-client';
import type { DataRetention } from './parse-job-config';
import { ResticError } from './restic-error';

export interface BackupRepos {
  readonly data: ResticClient;
  readonly keys: ResticClient;
}

type ManifestReads = Pick<BackupFileReads, 'readText' | 'readFileSHA256'>;

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

// A failure that restic reports becomes a failed receipt, which nixie records and reports; any
// other failure leaves the set without a receipt, so the next run publishes it again.
export async function publishBackupSet(
  repos: BackupRepos,
  retention: DataRetention,
  files: ManifestReads,
  set: BackupSetEntry,
): Promise<BackupReceipt> {
  const verified = await readVerifiedManifest(files, set);

  if ('refused' in verified) {
    return buildReceipt({
      sequence: set.sequence,
      writtenAt: Date.now(),
      dataSnapshotID: null,
      keys: emptyKeyPublication,
      failures: [verified.refused],
    });
  }

  const failures: string[] = [];
  const tags = [`set-${String(set.sequence)}`, `kind-${verified.manifest.kind}`];

  const dataSnapshotID = await writeDataSnapshot(repos.data, retention, set, tags).catch(
    (error: unknown) => {
      failures.push(requireResticFailure(error));

      return null;
    },
  );

  const keys = await writeKeySnapshot(repos.keys, set, tags, failures);

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
  files: ManifestReads,
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

async function writeDataSnapshot(
  data: ResticClient,
  retention: DataRetention,
  set: BackupSetEntry,
  tags: readonly string[],
): Promise<string> {
  await data.createRepository();

  const snapshotID = await data.writeSnapshot(join(set.directory, 'nixie.db'), 'nixie.db', tags);

  await data.runRetention(retention);

  return snapshotID;
}

function requireResticFailure(error: unknown): string {
  if (error instanceof ResticError) {
    return error.message;
  }

  throw error;
}

// The key repo keeps the new snapshot alone, whatever host or path an older one names, and prunes
// every unused byte, because a snapshot's removal alone leaves its blobs readable.
async function writeKeySnapshot(
  keys: ResticClient,
  set: BackupSetEntry,
  tags: readonly string[],
  failures: string[],
): Promise<KeyPublication> {
  const written = await keys
    .createRepository()
    .then(async () => {
      const keySnapshotID = await keys.writeSnapshot(
        join(set.directory, 'keys.db'),
        'keys.db',
        tags,
      );

      const snapshotIDs = await keys.readSnapshotIDs();

      const removed = snapshotIDs.filter((snapshotID) => snapshotID !== keySnapshotID);

      await keys.removeSnapshots(removed);

      return { keySnapshotID, removed };
    })
    .catch((error: unknown) => {
      failures.push(requireResticFailure(error));

      return null;
    });

  if (written === null) {
    return emptyKeyPublication;
  }

  const prune = await runStep(keys.runPrune, failures);

  const check = prune === 'passed' ? await runStep(keys.runCheck, failures) : 'not-run';

  return {
    keySnapshotID: written.keySnapshotID,
    removedKeySnapshotIDs: written.removed,
    prune,
    check,
  };
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
