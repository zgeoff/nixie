# Approvals

Every proposal that waits for the user's answer, whatever it proposes, has one row in the
`proposals` table and one answer path. A proposal is a tool call that policy holds, a memory write,
a skill change or a rule change. A client lists the rows, shows each with the choices the host
offers, and sends one answer. The host checks the answer the same way for every kind.

## The shared row

Each kind keeps its own records and its own projection. A second projection folds those records, and
3 records of the approvals module, into the `proposals` row: its kind, risk class, action hash, rule
hash, cause, state, lapse time and defer fields. A kind module reads only its own payloads and says
what each means for the row, so the approvals module imports no kind module and the row rebuilds
from the log. The migration that creates the table folds the records that already exist, and a test
holds that fold equal to the live one.

A closed row never reopens. A row is pending, deferred, approved, declined, lapsed or withdrawn.

## The answer

An answer names the proposal, the action hash the client showed, and one choice: approve, always
allow, defer or decline. The host runs these checks in one write transaction and refuses at the
first that fails:

1. The caller is a live identity.
2. The row exists, and it is open and not past its lapse. Otherwise the answer is refused as closed.
3. The action hash, and for always allow the rule hash, still match what the kind holds now.
   Otherwise the answer is refused with the current hashes, so the client shows the changed
   proposal.
4. The choice is one the row offers, a note is neither empty nor too long, a memory edit goes only
   with approving a memory write, and a defer time lies within the limits the host sets. Otherwise
   the answer is refused as not allowed.

Then the kind's handler applies the choice. Always allow is offered only for a routine action that
policy held because no rule steered it, and it writes the rule the proposal carried and approves the
call in the same transaction. A kind whose writes open their own transaction, such as memory, runs a
guard inside it that repeats the checks at the commit.

A refusal is stored under the client action ID in the same transaction, so a retry gets the same
refusal. A batch answer settles each of its answers alone.

## Defer

A defer sets the row to deferred and records the user's note, if any, as a message on the task. The
return time is the asked time, or the end of the quiet hours the asked time falls in, read in the
zone of the user's messages. The row lapses at the later of its old lapse and the return time plus
the kind's lapse interval, and never after the proposal's own deadline. A timer returns each
deferred row once its return time passes and writes a returned record. A row that was answered,
lapsed or deferred again in between never returns, because the timer reads the row again in its
write transaction.

The deployment configuration sets `quiet_hours`, and `approvals.defer` sets the default minutes and
the evening and morning times that clients offer.

## memory_write

`memory_write` is an effect name. A deny or ask rule that lists it also stops a call that declares
`note`, so a rule can hold every memory write. An allow rule that lists it covers no call, so a
memory write stays asked until a rule allows its `note`.
