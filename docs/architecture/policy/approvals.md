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

A row's family is `action`, `memory`, `skill`, `rule_change`, `proposed_rule` or `mandate`. The
[rules](rules.md#proposed-rules) doc covers the last 2, which take the causes `proposed_rule` and
`mandate`.

A closed row never reopens. A row is pending, deferred, approved, declined, lapsed or withdrawn.

The row names the identity that answered it in `answered_by`, set when the kind's answer record
folds in. An approve, an always allow and a decline set it, and a defer does not, because a deferred
row is still open. A lapse and a withdrawal set none. A migration backfills the column from the same
records, and a test holds the backfill equal to the fold.

## Listing and reading

`approvals.listItems` returns each open row that has a body, with the choices the host offers, in
these groups and this order:

1. Always-ask: `lifting` rows first, then `always_ask` rows.
2. Routine, sorted by task, with each task's oldest row first.
3. Memory.
4. Deferred. A deferred row sits only here, whatever its risk class.

Every group but routine lists its oldest row first. The call leaves out a closed row, a row past its
lapse and a row whose body is gone. A row whose kind has no handler, such as after a rollback of
that kind, stays out of the list and refuses every answer as not allowed.

`approvals.readProposals` takes up to 100 proposal IDs, full or short, and returns each row in any
state with its body, its task, the device name of the identity that answered it and whether the
caller answered it. A card reads its own row there after it closes, when the list no longer holds
it. The call leaves out a row it cannot show.

Each body carries an approve label, such as `Run mail.send to harbour@example.org`, which names what
Approve does.

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
5. For an `approve` or `always_allow` on an `always_ask` or `lifting` row, the caller's passkey
   assertion passes the [passkey check](./passkeys.md). Otherwise the answer is refused as
   `NO_PASSKEY`, `PASSKEY_REQUIRED` or `PASSKEY_FAILED`, and the refusal is not stored.

Then the kind's handler applies the choice. Always allow is offered only for a routine action that
policy held because no rule steered it, and it writes the rule the proposal carried and approves the
call in the same transaction. A kind whose writes open their own transaction, such as memory, runs a
guard inside it that repeats the checks at the commit.

A refusal other than a passkey refusal is stored under the client action ID in the same transaction,
so a retry gets the same refusal. A batch answer settles each of its answers alone.

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

`memory_write` is an effect name. `memory.remember`, `memory.edit` and `memory.retire` declare it,
in the conversation and a task run alike. Every other memory tool declares `note`, so a rule on
`memory_write` never reaches a pin, an unpin, a rating or a comment.

A rule on `memory_write` matches as a rule on any other effect does:

- A deny rule denies the write, and the model reads the rule's sentence.
- An ask rule makes the write a memory proposal with the review reason `ask_rule`. The call writes
  no action proposal, because the memory proposal is the user's review.
- An allow rule lets the memory gate run the token check alone.

[The decision point](./decision-point.md#memory-writes) gives a write that no rule decides the
outcome `gate`, and the memory gate then runs every check. With the starter rules, no rule matches
`memory_write`, so every memory write runs every check.

[Memory writes](../memory/writes.md#rules-on-memory-writes) describes what the gate does under each
answer.
