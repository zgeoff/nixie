# Approvals

Every proposal that waits for the user's answer has one row in the `proposals` table. A proposal is
a tool call that policy holds, a memory write, a skill change, a rule change, an MCP server change
or a prompt override. A client lists the rows, shows each with the choices the host offers, and
sends one answer. The host checks the answer the same way for every kind.

## The shared row

Each kind keeps its own records and its own projection. A second projection folds those records, and
3 records of the proposals module, into the `proposals` row: its kind, risk class, action hash, rule
hash, cause, state, lapse time and defer fields. A kind module reads only its own payloads and says
what each means for the row, so the proposals module imports no kind module and the row rebuilds
from the log. The migration that creates the table folds the records that already exist, and a test
holds that fold equal to the live one.

A row's family is `action`, `memory`, `skill`, `rule_change`, `mcp` or `prompt`. A `rule_change` row
takes one of 3 causes, and its cause picks the handler: `rule_widening` for a change from the
definitions repo, and `proposed_rule` and `mandate`, which the [rules](rules.md#proposed-rules) doc
covers. The 3 share one family so the release before still reads the proposals table. That release
lapses every `rule_change` row with `rules.change_lapsed`, and refuses an answer to a row it has no
record for. The host's rule answer route answers only a `rule_widening` row, because the other 2
take the passkey.

A closed row never reopens. A row is pending, deferred, approved, declined, lapsed or withdrawn.

The row names the identity that answered it in `answered_by`, set when the kind's answer record
folds in. An approve, an always allow and a decline set it, and a defer does not, because a deferred
row is still open. A lapse and a withdrawal set none. A migration backfills the column from the same
records, and a test holds the backfill equal to the fold.

## One lifecycle

Every family goes through the same steps, in the proposals module:

1. `proposeInTransaction` draws the short ID and writes `proposals.proposed`, which creates the row.
   The family writes its body record, such as `skills.write_proposed`, in the same transaction, with
   the same proposal ID. A body record creates a row only when no `proposals.proposed` came before
   it, so a log written before the lifecycle rebuilds to one row per proposal.
2. A proposal replaces an open one of the same family, the same proposer and the same `sameThing`
   key: the core withdraws the old one in the same transaction. A proposal with no proposer, and a
   family with no key (memory, action), never replaces.
3. One sweep lapses the open rows of every family once their lapse time passes, through each
   family's `discard`. A row whose family has no handler stays open. When a family's writes open
   their own transaction, as memory's do, the sweep hands each of its rows to that family, which
   lapses the row in a transaction of its own.
4. An approve or a discard that succeeds writes `proposals.settled` in the same transaction, on the
   thread of each proposer. A refusal writes none, and the row stays open.
5. Each proposer hears the settlement. A conversation reads it in the note of its next turn, and a
   task reads it as an inbox record that wakes it. A task gets no inbox record for the settlement of
   an action proposal, and hears `action.outcome` instead. When a proposer's own withdrawal closes
   the row, that proposer's note leaves the settlement out, because the withdraw call's result holds
   the outcome. A finished task takes no input, so its settlement goes to the report target of the
   task run that opened or merged into the proposal, or else to the task's starter. That settlement
   carries the task's ID. When a finished task has neither, its settlement stays on its own thread
   as a plain record that wakes nothing, so its audit thread stays whole. Settlements that land in
   one batch read as one message.

Every close of a row goes through the lifecycle, so each writes `proposals.settled`: an answer, a
lapse, a proposer's withdrawal, a decline of an ask that withdraws the suggested rule resting on it,
the seed that withdraws the pending rule changes it applies, and the purge of a memory item that
lapses its pending proposals. A proposal that nixie makes on its own, such as a suggested rule, has
no proposer, so its settlement has no thread.

A task never asks again for an action that the user declined in the same task run. A call whose
action hash matches a proposal of that task, declined after the task run opened, gets that decline
back, as a denied result that names the declined proposal's short ID, and writes no proposal. The
same holds for a call that a rule's lift allowed but a budget refused, on the task's step. A new
task run starts clear, so it can ask again. A call with no open task run, such as one in a
conversation, never matches a decline.

A proposal's short ID comes from `createShortID` with a check against every earlier row, for every
family. A call by short ID finds the newest row that holds it, and a call by proposal ID finds that
row, so the approval card, which sends the proposal ID, still answers an older row that shares a
short ID. Rows made before the lifecycle keep the short IDs they hold.

The model lists and withdraws its proposals with 2 tools. `proposals.pending` lists the open rows
that the caller proposed, and those of the tasks the caller started itself, closed tasks included: a
memory row shows its change, gist, topic, reason and, on request, its text, and any other row shows
the card's sentence. `proposals.withdraw` withdraws the caller's own stake in an open row, one that
it proposed or that it merged a memory proposal into, and reports a row that closed already. The row
stays open for the other proposers, and `proposals.proposer_left` records that this proposer no
longer holds a stake. The last proposer to withdraw closes the row, and the settlement reaches no
thread of a proposer that left.

A family's handler supplies `lapseIntervalMs(config, cause)`, which reads `approvals.lapse_days`
from the server config, and `discard`, which undoes what the proposal held for a decline, a lapse or
a withdrawal. `approvals.lapse_days` holds the days per family: 3 for an action and 14 for each
other family. A cause that lapses only at its deadline, such as a mandate, returns no interval and
ignores those days. The key `memory.proposal_lapse_days` is no longer accepted, and the server
refuses to start while a config holds it.

A prompt override takes the `prompt` family, risk class `always_ask`, so approving it needs a
passkey. Its action hash is the override's hash, and `readHashes` folds in the base it replaces, so
an approval after the override in force moved is refused as a conflict.

A rollback past the release that ships the lifecycle needs a restore from a backup taken before the
upgrade: the upgrade drops the memory table's `status` and `lapse_at` columns and renames the
suggested-rule tables.

## Listing and reading

`approvals.listItems` returns each open row that has a body, with the choices the host offers, in
these groups and this order:

1. Always-ask: `lifting` rows first, then `always_ask` rows.
2. Routine, sorted by task, with each task's oldest row first.
3. Memory.
4. Deferred. A deferred row sits only here, whatever its risk class.

The same call returns the unknown outcomes in a list of their own, apart from the rows, and a client
shows them before every group. An unknown outcome is an action whose outcome nixie could not settle
and the user must. An item holds the action as its proposal showed it, each attempt and each check
with its time, the reason it came to the user and its risk class. Items list oldest first, and an
item has no fields when a forget removed the arguments. The list sits apart so that a client of the
release before still reads every row it knows.

Within each risk class, every group but routine lists its oldest row first. The call leaves out a
closed row, a row past its lapse time and a row whose body is gone. A row whose kind has no handler,
such as after a rollback of that kind, stays out of the list, and the host refuses every answer to
it as not allowed.

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
   assertion, or the caller's open [passkey window](./passkeys.md#the-window), passes the
   [passkey check](./passkeys.md). Otherwise the answer is refused as `NO_PASSKEY`,
   `PASSKEY_REQUIRED` or `PASSKEY_FAILED`, and the refusal is not stored.

Approving an action proposal queues the action once, under the proposal's ID, as
[actions](../core/actions.md#approved-actions) describes. That holds for a call to a tool that runs
inside the turn as well: the task's step runs it. A proposal for a call with a deadline lapses at
the earlier of its usual lapse and the deadline, and an approval after the deadline fails the
action.

Then the kind's handler applies the choice. Always allow is offered only for a routine action that
policy held because no rule steered it, and it writes the rule the proposal carried and approves the
call in the same transaction. A kind whose writes open their own transaction, such as memory, runs a
guard inside it that repeats the checks at the commit.

A refusal other than a passkey refusal is stored under the client action ID in the same transaction,
so a retry gets the same refusal. A batch answer settles each of its answers alone.

## An approved call on its card

A row that the user approved for an action carries a `call` field when `approvals.readProposals`
reads it. The host derives it at read time from the action the approval queued, so the card follows
the call's own records and never the model's words.

| `call.state` | Card text                  | Source                                                                                              |
| ------------ | -------------------------- | --------------------------------------------------------------------------------------------------- |
| `applied`    | Approved, applied          | the action is done                                                                                  |
| `failed`     | Approved, failed: <reason> | the action failed, a stop cancelled it before an attempt started, or the approved row has no action |
| `waiting`    | Approved, waiting to run   | the action is still pending                                                                         |
| `unknown`    | Approved, outcome unknown  | the action's outcome is unknown and waits on the user                                               |

A failed call's reason is the provider's message from the outcome record, or else the error text of
the result record that the outcome names, or else a plain sentence for the outcome's reason code.
After a forget removes the erasable fields, the sentence for the code remains. The card cuts the
reason to 300 characters. Memory, skill and rule approvals have no call, so their cards show only
"Approved". A card that follows a task's thread reads its rows again when a record lands there, and
the digest reads a row that has left the list again while its call waits.

## Answering an unknown outcome

`approvals.answerUnknownOutcome` takes the action ID, one choice of `happened`, `retry` or `drop`, a
client action ID and, for a retry that needs one, a passkey assertion. The host answers in one write
transaction: the caller is a live identity, the action waits on the user, and a retry of an action
that always asks or lifts passes the [passkey check](./passkeys.md#unknown-outcomes). The answer is
stored under the client action ID, and it records the identity that gave it. A second answer to the
same action is refused as not allowed. The host's own route needs no passkey.

## Defer

A defer sets the row to deferred and records the user's note, if any, as a message on the task. The
return time is the asked time, or the end of the quiet hours the asked time falls in, read in the
zone of the user's messages. The row lapses at the return time plus the kind's lapse interval, and
never after the proposal's own deadline. A timer returns each deferred row once its return time
passes and writes a returned record. A row that was answered, lapsed or deferred again in between
never returns, because the timer reads the row again in its write transaction.

The deployment configuration sets `quiet_hours`, and `approvals.defer` sets the default minutes and
the evening and morning times that clients offer.

## memory_write

`memory_write` is an effect name. `memory.remember`, `memory.edit`, `memory.retire`, `memory.pin`
and `memory.retopic` declare it, in the conversation and a task run alike. `memory.unpin` declares
`note`, so a rule on `memory_write` never reaches an unpin. A rule on the tool name `memory.unpin`
still decides it, and with the starter rules it applies at once. A rule that matches by tool name
and a rule that matches by the `memory_write` effect cover the same memory writes.

A rule that names `memory.edit` also covers `memory.retopic`, which moves a topic or a list of
items. An ask rule, and a call that no rule decides, hold a `memory.retopic` call as an action
proposal instead of a memory proposal, as [moving a topic](../memory/store.md#moving-a-topic) says.

A rule on `memory_write` matches as a rule on any other effect does:

- A deny rule denies the write, and the model reads the rule's sentence.
- An ask rule makes the write a memory proposal with the review reason `ask_rule`, except for
  `memory.retopic`, which waits as an action proposal. A memory proposal is the user's review, so
  that call writes no action proposal.
- An allow rule applies the write at once, with a notice, when it covers the write. The memory gate
  then runs the hidden-character check alone. Whether a rule covers a write depends on its checks on
  `subject` and on the `image` arguments
  ([memory writes](../memory/writes.md#rules-on-memory-writes)).

[The decision point](./decision-point.md#memory-writes) gives a write that no rule decides the
outcome `gate`, and the memory gate then runs every check. With the starter rules, no rule matches
`memory_write`, so every memory write runs every check, and a pin or a label-only edit waits for
review.

[Memory writes](../memory/writes.md#rules-on-memory-writes) describes what the gate does under each
answer.
