// Operations: each flow as commented code. Not compiled. No package imports this file.
// Shapes: 02-types.ts. Where a doc and a sketch differ, the sketch wins for shapes and the doc
// wins for rules. A place marked (open: <name>) is not settled: open/operations.md holds the item.

// ---- A. The publish of one backup set ----
// publishBackupSet, in the backup job's package, under the backup job's staging lock.

async function publishBackupSet(repos, retention, files, set) {
  // 1. Check the manifest.
  requireManifest(files, set);

  // 2. The publish number: one more than the highest in either repository, or 1 with none.
  const keys = await repos.keys.readSnapshots();
  const data = await repos.data.readSnapshots().catch(() => null); // null: the list failed

  const highest = readHighestPublish(keys, data ?? []); // null: no snapshot has a publish number

  if (data === null && highest === null) {
    // The data repository cannot be listed and the key repository holds no numbered snapshot.
    return writeFailedReceipt(files, set); // no snapshot, so a publish number never repeats
  }

  const publish = (highest ?? 0) + 1;

  // 3. The key snapshot first, so a numbered data snapshot exists only if its key snapshot does.
  const replaced = pickNewestKey(keys);

  const note = await readRestoreNote(files); // RestoreNote | null

  const keyTags = [`set-${set.sequence}`, `kind-${set.kind}`, `publish-${publish}`];
  const restoredCopyIsNotNewest = note !== null && note.keySnapshotID !== replaced?.snapshotID;
  const replacedDroppedTheTags = replaced !== null && replaced.publish === null && highest !== null;

  if (restoredCopyIsNotNewest) {
    keyTags.push(`proven-from-${publish}`); // and no legacy-set- tag
  } else if (replacedDroppedTheTags) {
    keyTags.push(`proven-from-${publish}`);
  } else if (replaced !== null) {
    if (replaced.publish === null && replaced.set !== null)
      keyTags.push(`legacy-set-${replaced.set}`);

    if (replaced.legacySet !== null) keyTags.push(`legacy-set-${replaced.legacySet}`);

    if (replaced.provenFrom !== null) keyTags.push(`proven-from-${replaced.provenFrom}`);
  }

  const keySnapshot = await repos.keys
    .writeSnapshot(files.keysPath, 'keys.db', keyTags)
    .catch(() => null);

  // 4. The data snapshot, with the same set-, kind- and publish- tags, then the retention.
  //    A key snapshot that failed skips this step.
  if (keySnapshot !== null) {
    await repos.data.writeSnapshot(files.dataPath, 'nixie.db', keyTags.slice(0, 3));
    await repos.data.runRetention(retention);
  }

  // 5. Only when the key snapshot of step 3 is written, and whether step 4 passed or failed:
  //    remove every other key snapshot, prune and check. With a failed key snapshot: remove none.
  if (keySnapshot !== null) {
    await repos.keys.removeSnapshots(otherThan(keySnapshot));
    await repos.keys.runPrune();
    await repos.keys.runCheck();
  }

  // 6. Remove the restore note, then write the receipt. The receipt is at format 1.
  await removeRestoreNote(files);

  return writeReceipt(files, set);
}

// ---- B. The key snapshot that counts as the newest ----

function pickNewestKey(keys) {
  if (keys.length === 0) return null;

  // Drop each snapshot with no publish number whose set- number a numbered one names in
  // legacy-set-.
  const named = new Set(keys.filter((key) => key.publish !== null).map((key) => key.legacySet));

  const live = keys.filter((key) => key.publish !== null || !named.has(key.set));

  // Every snapshot that remains has a publish number: the highest number.
  if (live.every((key) => key.publish !== null)) return maxBy(live, (key) => key.publish);

  // Otherwise the latest by restic's time. This is the one case that reads a clock.
  return maxBy(live, (key) => key.writtenAt);
}

// ---- C. The pair ----

function pickBackupPair(keys, data, dataSnapshotID) {
  const key = pickNewestKey(keys);

  if (key === null) return refuse('no-key-snapshot');

  if (dataSnapshotID === null) {
    // The default data snapshot.
    const matches =
      key.publish !== null
        ? data.filter((snapshot) => snapshot.publish === key.publish)
        : // A key snapshot with no publish number pairs with the latest data snapshot that has
          // no publish number and the same set- number.
          latestOf(
            data.filter((snapshot) => snapshot.publish === null && snapshot.set === key.set),
          );

    if (matches.length === 0) return refuse('no-data-of-publish'); // the message names a data snapshot

    if (matches.length > 1) return refuse('duplicate-publish');

    return { key, data: matches[0], relation: 'same-publish' };
  }

  // A data snapshot that you named.
  const named = data.find((snapshot) => snapshot.snapshotID === dataSnapshotID);

  if (named === undefined) return refuse('no-such-data-snapshot');

  if (key.publish !== null && named.publish !== null) {
    if (named.publish === key.publish) return accept(key, named, 'same-publish');

    if (named.publish > key.publish) return refuse('data-newer-than-keys');

    if (key.provenFrom !== null && named.publish < key.provenFrom) return refuse('data-unproven');

    return accept(key, named, 'older-data');
  }

  if (key.publish !== null && named.publish === null) {
    const vouched = key.provenFrom === null && key.legacySet !== null && named.set <= key.legacySet;

    return vouched ? accept(key, named, 'older-data') : refuse('data-unproven');
  }

  if (key.publish === null && named.publish === null) {
    if (named.set === key.set) return accept(key, named, 'same-publish');

    if (named.set < key.set) return accept(key, named, 'older-data');

    return refuse('data-newer-than-keys');
  }

  // The key snapshot has no publish number and the data snapshot has one. The key snapshot
  // carries no proven-from- tag, so the fetch cannot tell what the key copy vouches for.
  return refuse('data-unproven');
}

// ---- D. nixie-backup fetch --to <directory> [--data-snapshot <snapshot_id>] ----
// It reads the NIXIE_BACKUP_* repository and password variables that the backup job reads, and
// never the staging folder.

async function runFetch(repos, directory, dataSnapshotID) {
  // 1. Refuse a directory that exists and is not empty. Exit 1.
  if (await isNonEmpty(directory)) return exit(1);

  // 2. The unfinished-backup marker, before the first copy.
  await writeMarker(directory, unfinishedBackupMarker);

  for (let repicks = 0; repicks <= fetchRepickLimit; repicks += 1) {
    // 3. List both repositories and pick. A refusal fails the step `pick`.
    const pick = pickBackupPair(
      await repos.keys.readSnapshots(),
      await repos.data.readSnapshots(),
      dataSnapshotID,
    );

    if ('refused' in pick) return fail('pick', pick.refused); // logs backup.fetch_failed, exit 1

    // 4. Fetch both copies.
    await repos.keys.restoreSnapshot(pick.key.snapshotID, directory); // keys.db
    await repos.data.restoreSnapshot(pick.data.snapshotID, directory); // nixie.db

    // 5. List the key repository again. When the newest key snapshot is another one, empty the
    //    directory but for the marker, and pick again.
    const newest = pickNewestKey(await repos.keys.readSnapshots());

    if (newest?.snapshotID === pick.key.snapshotID) {
      // 6. The pair file, then the marker, then one log line. Exit 0.
      await writeFetchedPair(directory, pick);
      await removeMarker(directory, unfinishedBackupMarker);

      log('backup.fetched', pick);

      return exit(0);
    }

    await emptyButMarker(directory);
  }

  return fail('pick'); // the newest key snapshot changed a fourth time
  // Any failure: one backup.fetch_failed line, the marker in place, exit 1.
}

// ---- E. nixie restore --from <directory> --yes ----
// restoreDataBackup, in the log module. The comment after each step says what the data directory
// holds when a kill lands after that step, and what you do next.

async function restoreDataBackup(options) {
  // 1. Refuse a directory with the unfinished-backup marker. Read fetched-pair.json: with a file
  //    that does not parse, the restore replaces nothing. With no file, the directory came from
  //    `nixie backup --to`, and the restore reads it as no gap.
  const pair = await readFetchedPair(options.directory); // FetchedPair | null

  //    Kill: nothing changed. Run the restore again.

  // 2. Take the writer lock, check both copies and stage them.
  //    Kill: staged copies, no marker. Run the restore again.

  // 3. Write the marker in the state `replacing`.
  await writeRestoreState(files, options.dataDir, 'replacing');

  //    Kill: the marker reads `replacing`. No build starts. Run the restore again.

  // 4. Move both databases.
  //    Kill: the same.

  // 5. Take the backup job's staging lock, remove every set folder, and write restore-note.json
  //    at the root of staging. The log module owns this step, and it runs under the writer lock.
  //    The restore fails here when it cannot take the staging lock, and the marker remains.
  await writeRestoreNote(staging, {
    format: 1,
    restoredAt,
    keySnapshotID: pair?.key.snapshotID ?? null,
  });

  //    Kill: the same. A second pass removes nothing more and writes the same note.

  // 6. With `hold: true`: write the PendingRestore payload to a second file and rename it over
  //    the marker, which then reads `holding`. With `hold: false`: remove the marker.
  if (options.hold)
    await renamePayloadOverMarker({
      version: 1,
      recoveryID: crypto.randomUUID(),
      restoredAt,
      backupTakenAt,
    });
  else await writeRestoreState(files, options.dataDir, 'none');

  //    Kill: the marker reads `holding`, or no marker exists. The next start of the server
  //    installs the recovery holds.

  // The restore writes nothing into the restored database.
  return { files: dataFiles, pair };
}

// How nixie reads the marker file:
//   no file                           none
//   empty, or does not parse          replacing
//   parses as PendingRestore          holding

// ---- F. The next start of the server ----

async function startServer() {
  // 1. startWriter passes a marker in the state `holding` only for a caller with
  //    installsRecoveryHolds: true. It refuses every other caller on `holding`, and every caller
  //    on `replacing`.
  const writer = await startWriter({ dataDir, installsRecoveryHolds: true });

  // 2. The migrations run.

  // 3. The start part `recovery_holds`.
  const placed = await installRestoreHolds(context, {
    pending: writer.pendingRestore,
    exemptTaskIDs: restoreExemptTaskIDs,
    readTasksWithPendingActions,
    readLaunchSources: async () => [],
  });

  await waitAtFaultPoint('recovery.holds.committed');
  await removeRestoreMarker(dataDir);
  await waitAtFaultPoint('recovery.holds.marker_cleared');

  // 4. The start part `recovery` needs `recovery_holds`, and every runner needs `recovery`.
}

async function installRestoreHolds(context, options) {
  if (options.pending === null) return null;

  return withWriteTransaction(context.log.writer, async (tx) => {
    // Read before the first stage of the start part `recovery` moves a running task.
    const unfinished = await readUnfinishedTasks(tx); // every task that is not done or closed
    const owners = await options.readTasksWithPendingActions(tx);

    const taskIDs = union(unfinished, owners).filter((id) => !options.exemptTaskIDs.includes(id));

    return placeRecoveryHoldsInTransaction(tx, context, {
      recoveryID: options.pending.recoveryID,
      cause: 'restore',
      startedAt: options.pending.restoredAt,
      backupTakenAt: options.pending.backupTakenAt,
      subjects: taskIDs.map((id) => ({ kind: 'task', id })),
    });
    // When the restore holds no conversation task, this transaction also writes the restore
    // notice (section H).
  });
}

async function placeRecoveryHoldsInTransaction(tx, context, request) {
  // A recoveryID with a `recoveries` row: write nothing.
  if (await hasRecovery(tx, request.recoveryID))
    return { recoveryID: request.recoveryID, held: 0, isNew: false };

  await writeRecord(tx, 'recovery.started', request);

  for (const subject of request.subjects) {
    // The fold inserts the row, or replaces the row of a subject that has one.
    await writeRecord(tx, 'recovery.hold_placed', {
      subject,
      recoveryID: request.recoveryID,
      cause: request.cause,
    });
  }

  // The transaction that writes the first hold closes the reader gate.
  await closeToOlderReaders(tx, recoveryHoldMigrationVersion);

  return { recoveryID: request.recoveryID, held: request.subjects.length, isNew: true };
}

// ---- G. The claim ----
// claimLease, in the tasks module: the one function that writes a lease.

async function claimLease(context, request) {
  return withWriteTransaction(context.log.writer, async (tx) => {
    // Each candidate query filters with buildRecoveryHoldCheck, so held work at the head of the
    // order never hides the work behind it.
    const candidate = await request.readCandidate(tx, context.clock.now()); // ClaimCandidate | null

    if (candidate === null) return null;

    for (const subject of candidate.subjects) {
      if (await isRecoveryHeld(tx, subject)) {
        if (NIXIE_TEST_BUILD) throw new Error('a candidate query returned held work');

        return null; // refused: no lease, no step start, no record
      }
    }

    return upsertLease(tx, candidate.workID); // then request.onClaim, as the code has it
  });
}

// ---- H. The hold release ----

async function releaseRecoveryHolds(context, request) {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const subjects = request.subjects === 'all' ? await readHeldSubjects(tx) : request.subjects;

    for (const subject of subjects) {
      const hold = await readHold(tx, subject);

      // The fold deletes the row. No task state, lease, resume_state or claimable_at changes.
      await writeRecord(tx, 'recovery.hold_released', {
        subject,
        recoveryID: hold.recoveryID,
        by: request.by,
      });

      if (subject.kind === 'task' && subject.id === conversationTaskID) {
        // The restore notice: one inbox record on the conversation's thread. It wakes no step.
        const recovery = await readRecovery(tx, hold.recoveryID);

        await writeRecord(tx, 'recovery.notice', {
          recoveryID: hold.recoveryID,
          restoredAt: recovery.startedAt,
          backupTakenAt: recovery.backupTakenAt,
        });
      }
    }

    const left = await countHolds(tx);

    if (left === 0) await reopenToOlderReaders(tx); // the hold release of the last hold reopens the gate

    return { released: subjects, left };
  });
}

// ---- I. The reader gate ----
// In the db lib. The gate is the stored `oldest_reader`, never the schema's `oldestReader`.

async function closeToOlderReaders(tx, reader) {
  // open_oldest_reader := the stored oldest_reader; oldest_reader := reader.
}

async function reopenToOlderReaders(tx) {
  // oldest_reader := open_oldest_reader; open_oldest_reader := null.
}

// A migration that runs while the gate is closed moves open_oldest_reader and never lowers
// oldest_reader. The migration runner's one statement that sets oldest_reader holds this rule.

async function syncRecoveryHoldGate() {
  // At each start: a closed gate with no row in recovery_holds is reopened. A log reset is the
  // one case that gives it.
}
