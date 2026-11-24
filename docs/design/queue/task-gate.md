# Two meanings of "recovery"

- **Status:** agreed; the [task gate](../../architecture/core/pause.md#the-task-gate) it began as is
  built, and only the rename is left

"Recovery" names two separate things in nixie: what runs at each start after a crash, and a restore
under one `recoveryID`. The rename gives the word one meaning. It shares no code with the task gate.

## The two recoveries

| Name             | Crash side today  | Crash side after the rename | Restore side, unchanged                                                    |
| ---------------- | ----------------- | --------------------------- | -------------------------------------------------------------------------- |
| what it is       | crash recovery    | the restart sweep           | recovery: one restore under one `recoveryID`                               |
| start part       | `recovery`        | `restart_sweep`             | –                                                                          |
| entry point      | `runRecovery`     | `runRestartSweep`           | `installRestorePause`                                                      |
| stored or public | –                 | –                           | `recoveries` table, `recovery.started`, `recovery.notice`, `recovery.read` |
| fault points     | `recovery.step.*` | `restart_sweep.*`           | `recovery.pause.*`                                                         |

Call the crash side the restart sweep. Keep "recovery" for the restore side, because its names are
stored and published: renaming them would need a migration, new record kinds while the old ones are
still read, and a new API route beside the old one. The crash side holds only code names and fault
point IDs.

## Builder decides

- The fault point IDs' new prefix, once the old IDs are gone.
