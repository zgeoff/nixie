# 0046: Resetting the event log

- Date: 2026-10-14
- Status: decided
- Issue: [GEO-514](https://linear.app/zgeoff/issue/GEO-514)

nixie gets one exception to its append-only event log: a full reset that removes every record. The
host command `reset --keep-sessions` asks the running server to reset itself. The server deletes the
log, every projection, the definitions rows and the key store's keys, and keeps the live device
sessions, so every signed-in device stays signed in. A reset is not a forget: backups from before it
still hold the old data.

The reset destroys every sandbox before it removes anything, and a failed destroy stops it. It
empties the key store first, then wipes the database in one write transaction behind the writer
epoch check. That transaction writes the first records of the new log from the old highest sequence
plus 1: a definitions seed record for the definitions in force, a `log_reset` record on the
conversation thread with no free text, and a `session_kept` record for each live session. The server
then exits 0, and the normal start rebuilds the rest. The command runs only with `--keep-sessions`
and `--yes`.

A later filter that resets one area, such as only memories or only the conversation, shreds text
through the forget path and removes no record.

## Why

- The writer lock lets one process write the data directory, so the reset belongs to the process
  that holds it. An exit after the reset reuses the one start path instead of adding a second.
- Every kept session must point at a record of its pairing, so each kept session gets a record in
  the new log, and the new log explains each session from its own records.
- SQLite reuses sequence numbers after a delete. A device resumes its live stream after the last
  sequence it saw, so a log that restarted at 1 would show that device nothing new until the log
  passed the old number. A continued sequence makes the reset the device's next event.
- The conversation's memory of itself lives in the SDK transcript on the sandbox disk, outside the
  log. A reset that kept the sandbox would keep the conversation.
- The keys go first, so a crash part way leaves a log whose text reads as shredded, and a second
  reset finishes the work.
- Backups are the undo for a reset by mistake, so the command asks for `--yes`, and a reset that
  pruned them would have no undo.
- Records point at each other across modules by parent, thread and sequence, so removing one
  module's records would break the folds and foreign keys of the others. Removal stays one
  operation, in one place.

## Alternatives

- **An offline command.** The operator stops the server and runs the reset as a one-off process that
  takes the writer lock. It needs no drain, and it moves the stop and the start to the operator,
  which on Kubernetes means scaling to zero and running a Job.
- **A reset that keeps running.** The server resets and runs its start steps again in the same
  process. It avoids a restart, and it adds a second start path to test and keep in step.
- **A reset record first.** The log refuses a record with no definitions, so the reset record cannot
  come before the definitions seed record.
- **A log that restarts at sequence 1.** It is simpler, and it stalls every kept device's live
  stream.
- **Keeping revoked sessions.** A revoked token would stay refused under its own session ID, and the
  reset would carry rows that no device uses.
- **Wiping the transcript inside the kept sandbox.** It is faster, and it needs a new guest command
  and keeps any file the model wrote on that disk.
- **A reset that is a forget.** It would report pending until the key repository pruned every
  earlier snapshot, and it would remove the undo.
- **A reset that prunes the backups.** It is permanent at once, gives nixie a direct path to delete
  backups, and has no undo.
- **A filter that removes records.** It gives a clean log for one area, and it breaks the other
  modules' folds and foreign keys.

## Consequences

- The append-only rule has one exception. Triggers still refuse every update and delete, and only
  the reset drops them, inside its own transaction.
- The enrol, label and revoke history of every kept session is lost. Each session keeps its original
  paired time and its current label.
- An unused enrolment code stops working, and a revoked token is refused as a stranger.
- Backups from before a reset hold the old data until they age out, and the command says so.
- A reset takes the server down for one restart and the time it takes to destroy and rebuild the
  sandboxes.
- A turn still running when the stop grace ends loses its lease, so its commit writes nothing.
