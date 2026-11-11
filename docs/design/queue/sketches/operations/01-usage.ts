// Operations: how a caller uses each shape. Not compiled. No package imports this file.
// The docs that point here: backup-publish-and-fetch.md, backup-and-recovery.md,
// recovery-release.md, seed-rules.md. Types: 02-types.ts. Flows: 03-flow.ts.
// A place marked (open: <name>) is not settled: open/operations.md holds the item.

// ---- A. You restore a lost host from the 2 repositories ----
//
//   # In the backup image, with the backup job's NIXIE_BACKUP_* variables and no data volume:
//   nixie-backup fetch --to /restore/pair
//
//   # To restore a data snapshot other than the default one, list the snapshots and name one:
//   nixie-backup snapshots
//   nixie-backup fetch --to /restore/pair --data-snapshot 4f2a9c1e
//
//   # In nixie's image, with the data volume and no backup credential:
//   nixie restore --from /restore/pair --yes
//
// The fetch prints one log line: 02-types.ts, section E. The restore's last line names
// `nixie recovery`.

// ---- B. You read the recovery and release each task ----
//
//   # After nixie starts:
//   nixie recovery                 # prints recovery/read as JSON
//   nixie task-release 7c1d…       # releases one task's recovery hold and prints the task's state
//
// The same 2 calls through the API:

await api.recovery.read();
// → { recovery: { restoredAt, backupTakenAt, held: [{ taskID: "7c1d…", name: "Cafe hours",
//     stateAtBackup: "waiting", wasRunning: false, unknownActions: 0 }] } }

await api.tasks.release({ clientActionID: crypto.randomUUID(), taskID: '7c1d…' });

// → the task's state. A task with no recovery hold: the error TASK_NOT_HELD, status 409.

// ---- C. A test seeds stored state ----

const ctx = await setupTest();
const action = await ctx.seed.failedAction({ taskID: task.id }); // `task`: a task the test made

// A package's setupTest() builds `seed` from the modules' seeders and creates no data itself.
async function setupTest() {
  const deps = await startTestAPI();

  return { ...deps, seed: buildSeeder(deps) };
}

// ---- D. Code outside the tasks module asks whether a task is under a recovery hold ----

await withWriteTransaction(writer, async (tx) => {
  const held = await isRecoveryHeld(tx, { kind: 'task', id: taskID });
  // The caller decides what it writes. ../../trigger-core.md, "Fires for a held task", holds the
  // rule for a fire.
});
