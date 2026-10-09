# Memory writes

- Status: Proposed
- Decisions: [0002](../../decisions/0002-approvals.md),
  [0006](../../decisions/0006-approval-record.md), [0010](../../decisions/0010-memory-store.md),
  [0011](../../decisions/0011-memory-writes.md), [0015](../../decisions/0015-taint-scope.md),
  [0024](../../decisions/0024-memory-in-context.md),
  [0031](../../decisions/0031-memory-capture-context-and-removal.md)

A write that introduces memory text applies at once, with a notice and undo, only when 3 checks pass
under [0011](../../decisions/0011-memory-writes.md): an exact quote from text the owner typed backs
it, every destination-like token in it appears in that quote, and a checker model that sees the
owner's whole message confirms the owner asserted it. Every other write becomes a memory proposal on
the digest sheet. The checks run inside the memory tools, after the
[policy decision point](../policy/decision-point.md) has allowed the call, so a write that fails a
check is held for review rather than refused. Consolidation, which rewrites many items at once, is
always a proposal. Everything in this doc beyond the decisions it links is a proposal.

## Who writes

The owner agreed 2 paths for memory writes, with SDK compaction retained:

- **The conversation and tasks** call `memory.remember` and `memory.retire` during a turn, such as
  when the owner says "remember that I'm vegetarian now".
- **The memory writer** captures passing facts in batches of committed conversation turns. A small
  model reads original owner messages in source order, the corresponding replies, and relevant
  current memory items. Its only tools are `memory.recall`, `memory.remember` and `memory.retire`.
  It supplies an exact owner quote for each candidate. The same write gate applies to both paths.

The writer triggers on a count of unprocessed owner messages, idle time or the oldest unprocessed
message's age. Configurable initial defaults are 4 messages, 5 minutes idle and 20 minutes maximum
age. The age limit works while replies keep a conversation busy. Capture does not replace the SDK
session or wait for compaction; explicit conversation writes do not wait for a batch. A summary is
never evidence for a memory.

### Batch boundaries and recovery

A durable batch covers committed conversation turns after the writer's cursor through a fixed record
sequence. Owner messages that arrive while it runs remain for the next batch. The host gives the
writer the eligible original messages with their IDs; an evidence selector must identify a readable
owner record within that batch and thread. The host resolves it and sets provenance itself. It never
accepts model-supplied source categories or quote offsets.

The writer's write tools stage candidates instead of applying them during extraction. Each batch
permits one final revision per target item. Distinct candidates that revise the same item reject the
batch before publication; retry feedback asks the writer to resolve them in source order. The host
never picks a winning fact by text matching. The host runs the gate outside the database
transaction, then publishes the batch's writes or review proposals, their notices, receipts and
advanced cursor in one transaction. Final publication rechecks source readability and any item
versions it revises under the task lease; stale results cannot overwrite a newer item. A source
forgotten during extraction cannot publish its text as a new memory or proposal.

A crash before publication retries the pending batch; a crash after it resumes after the committed
cursor. Extraction attempts can repeat, but the batch's committed effects do not. Failed checks
produce review proposals under the same gate as conversation writes; the cursor does not silently
skip those candidates. A failed batch keeps its cursor, records the error and retries under the
worker limits.

The [offline batch spike](../../../spikes/memory-batch/) checks the cursor transaction, late
arrivals, source-bound quotes and process-kill recovery with fixture output. It does not validate
model extraction, checker behavior, competing leases or SDK continuity. The model-eval spike found
zero invented entries on 3 models with quote-backed prompts in its synthetic sample; real-history
coverage and capture delay remain validation work.

The writer runs in its own imp like any worker under
[0026](../../decisions/0026-where-workers-and-the-conversation-run.md), because it reads the
conversation's reply, which can carry outside content. It runs in the background and never delays
the reply. Its model follows the deferred model-per-job choice in
[open items](../open-items.md#deferred-decisions), with Haiku 5.5 at low effort as the default from
the spike.

A write whose text matches an active item exactly, after the [matching](#the-quote-check) rules,
returns that item and writes nothing, so exact duplicates from the 2 paths create no second item. A
near-duplicate is the model's job: the writer sees the items retrieval found and revises one rather
than adding a second. A fact that replaces another, such as a new address, revises the old item or
retires it. **Why:** the [retrieval spike](../../../spikes/memory-retrieval/README.md) found that no
ranking separates a current fact from the one it superseded, so the store must not hold both as
active.

## The content gate

`memory.remember` runs these steps in order. The first check to fail ends the gate, and the write
becomes a proposal with that check as its review reason:

1. **Find the evidence.** Conversation and task writes search the calling thread’s last 20 owner
   messages by default, newest first. Batch writes resolve the original owner record selected from
   their fixed batch. A write with no quote skips to the proposal.
2. **The quote check.** The quote lies wholly in typed text outside any quoted block, as
   [the quote check](#the-quote-check) sets out.
3. **The token check.** Every destination-like token in the memory text appears in the quote.
4. **The checker.** A checker model confirms that the owner asserted the memory.
5. **Apply.** nixie writes the version, its record and a notice to the owner in one transaction.

The conversation window of 20 messages is configurable; a batch uses its bounded source records
instead. **Why:** a fact the owner stated a few turns earlier still counts, while a match far back
is more likely a coincidence than evidence. A job run has no owner messages, so every write from a
job run is a proposal, which 0011 requires for facts that reach nixie only through outside content.

The checks run in the tool, not in the decision point's pipeline. The decision point decides whether
the call may run, and the `note` effect is allowed by the starter rules; the gate decides whether
the change it makes needs review. An owner rule can ask for or deny `memory.remember` or
`memory.retire`. The decision point runs first, followed by the content gate for remember or the
intent gate for retire. Consolidation always produces review proposals.

A write that asks to pin its item always becomes a proposal, whatever the checks say. The owner pins
directly in the client. **Why:** a pinned item rides in the system prompt of every turn of every
task, so model-chosen text gets there only with the owner's approval.

### The quote check

The [checks spike](../../../spikes/memory-checks/README.md) wrote the quote check and the token
check as code and ran them over 31 sample messages, and every case gave the expected verdict. The
rules it settled:

- **Matching.** The quote and the message compare in Unicode NFC, with each run of whitespace
  collapsed to one space, and nothing else relaxed: case, punctuation and spelling must match. The
  message is normalised one grapheme at a time, and a match starts and ends on grapheme boundaries,
  so it maps back onto the spans the client recorded.
- **Typed text only.** A match passes when every character of it lies in a span the client labelled
  `typed`, as the [client design](../channels/client.md#paste-spans) records spans. A pasted,
  dropped or unknown character fails it, even a single combining accent, and so does a quote that
  runs across a typed span into a pasted one. Any one qualifying occurrence passes, so a pasted copy
  of the same words elsewhere never hides a typed one.
- **Quoted blocks.** The server finds quoted blocks in the message text: blockquote lines starting
  with `>`, code fences, and everything below a reply or forward header such as "On … wrote:". A
  match inside one fails. Inline quotation marks are left to the checker, because owners quote names
  and titles inside statements of their own.
- **Invisible characters.** A quote or memory text that holds a Unicode format character, such as a
  zero-width space or a bidirectional control, fails at once.

Dictated text from a later voice client arrives as its own span source. The quote check counts only
`typed` until the voice design decides whether dictated words serve as evidence, since a transcript
can mishear a name or a number.

### The token check

Code finds the destination-like tokens in the memory text and requires each one in the quote:

| Token          | Compared                                                                    |
| -------------- | --------------------------------------------------------------------------- |
| Email address  | Without case                                                                |
| URL            | Scheme and host without case, path exactly, found before an email inside it |
| Bare domain    | Without case, equal to a host in the quote                                  |
| Handle         | Without case                                                                |
| Phone number   | Digits only, against each number in the quote on its own                    |
| Account number | IBAN-style letters and digits, spaces dropped                               |

A country code the owner never typed fails the phone comparison, and a lookalike letter from another
script fails every comparison. **Why:** the token check stops the most harmful poisoned memory, one
that points nixie at an attacker's destination, whatever the checker says, so it errs towards a
proposal. The patterns are a list in code that grows with the destinations nixie's tools accept,
starting from the destination arguments that tools declare to the
[decision point](../policy/decision-point.md#effects).

### The checker

The checker is a separate model call that sees only the owner's message, with the quote and every
pasted span marked, and the memory text, under 0011. It answers asserted, not asserted or unsure,
with a reason, and only "asserted" lets the write apply. A timeout of 10 s by default, an error or
an unreadable answer counts as unsure. **Why:** the checks spike showed a negation ("I don't use
old@example.com any more"), a question and a quoted remark all pass the code checks, and only a
model reading the whole message tells them from a statement.

The checker shares its implementation with the consent checker that the
[decision point](../policy/decision-point.md#destination-limits) uses for direct requests, with its
own prompt. Its prompt is part of the policy snapshot, as
[the store](./store.md#definition-versioning) sets out. Its accuracy on real messages is a
[spike to run](../open-items.md#spikes-to-run) together with the consent checker's.

## Retirement intent

The owner agreed that chat removal is reversible retirement; only a checked client action destroys a
memory. `memory.retire` takes an item ID, the version read and an intent quote, with no replacement
text. The host verifies that the calling session read that item/version and binds the operation to
the current canonical item. An ambiguous target becomes a proposal rather than a guessed retirement.

The intent quote must lie wholly in the owner's typed text outside quoted blocks under the quote
rules. A separate checker sees the owner's message with its spans, the intent quote and the bound
item's text labelled as untrusted data. It checks whether the owner asks to retire that exact item,
including a statement that the fact stopped being true. It never treats instructions in the stored
item as authority. A timeout, unsure verdict or failed check produces a review proposal.

The destination-token check applies to new memory content; retirement introduces no content or
destination. It does not require the owner to repeat an old phone number or address. A successful
retirement copies the stored text and its content provenance, adds a version with the calling
actor's origin and task, and records the intent quote and source record separately. It never
relabels outside content as the owner's words. A stale item version fails before the state changes.

This narrows the content-write checks in 0011 for content-preserving retirement. The memory module
decision record captures that amendment. Model restore and undo are not added: those remain checked
client actions. A retirement notice offers undo and a permanent-delete action, while retired history
remains readable.

## Provenance

nixie sets every provenance field of a version from the calling step, never from the tool's
arguments. For content-introducing writes, a version whose quote, token and checker checks all
passed has the owner's words as its source; any other version has the least trusted source in the
calling task's context. The conversation is always untrusted under
[0015](../../decisions/0015-taint-scope.md), and every job run is untrusted in the first build, so a
proposal from either carries outside content as its source. An approved proposal keeps that source:
the owner's approval records that the owner accepted the text, in the proposal and approval fields,
and does not rewrite where the text came from. Retirement, restore and undo inherit the copied
content's source and evidence; their operation origin and intent remain separate.

**Why:** a later review of poisoned memory, or a consolidation that drops outside candidates, needs
the source as it was when the text entered nixie.

## Memory proposals

A write that fails the gate becomes a proposal in the
[proposals projection](../policy/approvals.md#the-proposal), in the routine class, so it gathers on
the digest sheet with the other routine items. A remember action binds the new text, evidence quote
and any target item/version. A retire action binds the intent quote and target item/version, with no
replacement text. Approval binds to that exact operation. Its sentence comes from the tool's
template, with the appropriate content or intent quote shown in its source message, or with "no
owner quote".

A memory proposal is not one of the 5 prompt causes from
[0005](../../decisions/0005-effects-and-taint.md), because the gate raises it, not the decision
point. It carries a review reason instead:

- no quote, or a quote outside the window or bounded batch
- retirement intent is ambiguous or does not identify the bound item
- the quote is not in typed text, or lies in a quoted block
- a token is not in the quote
- the checker said not asserted, said unsure, or could not be reached

The live view counts memory proposals by review reason, apart from prompts. **Why:** 0011 traded a
stream of memory proposals against the 0-prompt target, and the counts show which check sends the
most writes to review.

The owner approves, edits or rejects each memory proposal. An edit approves the owner's text
instead, with the owner as origin of that version. An approval applies the version in the
transaction that records the approval, under 0010. An approval of a proposal whose item moved past
the version it revises fails as stale, and the client offers the proposal against the current
version.

A memory proposal lapses after 14 days by default, set on the memory tools rather than on the `note`
effect they share with other tools, and the owner can change it. **Why:** a fact rarely goes stale
in 72 hours, the default for actions, and an owner who sweeps memory weekly should not lose a week's
facts.

A task run proposes at most 10 memory writes by default, and the tool returns an error past that
limit. **Why:** an injected instruction that makes a task propose memory in bulk would otherwise
flood the digest sheet.

A task's stop under [0027](../../decisions/0027-tasks-and-outside-actions.md) withdraws its open
memory proposals with its other proposals.

## Notices and undo

Each write that applies at once records a notice under 0011. The client groups one conversation
turn's writes, or one background batch's writes, into a compact notice beneath the relevant reply. A
summary such as "Remembered 3 things · View" expands to the actual items, with per-item undo bound
to the versions written. Retirement uses the same grouping with its own operation label.

A batch group attaches to the last reply in its fixed set of committed turns, with each item linking
to its original source. If there is no reply, the group is a standalone thread notice. A batch that
finishes after the reply adds a quiet notice in that thread. It sends no push and creates no digest
entry for successful writes. Review proposals remain on the digest sheet; unresolved outcomes and
failed forget cleanup retain their own status rather than appearing as successful writes. A task's
writes appear in its thread and its next report to the conversation.

Undo is a checked action. It adds a version with the text before the write, or retires the item when
the write created it, so undo itself is recorded and can be undone. A notice can open the checked
permanent-delete action in [the store](./store.md#forgetting); deletion needs its loss-listing
confirmation. Bulk deletion uses the fixed preview of selected retired items, and undo never crosses
a completed forget. Each undo checks the current item version; a later edit makes the old notice
action stale instead of silently overwriting it.

## Consolidation

Consolidation merges duplicates, settles contradictions and retires stale items, and it is always a
proposal that shows the diff, under 0011. nixie runs it as a system job:

- **When.** Weekly by default, at 03:00 on Sunday in the owner's time zone, and early once 50 items
  have been written since the last run. The owner can change both, or run it from the memory view.
  **Why:** a weekly batch gives the owner one review instead of a trickle, and the count bounds how
  much a busy week leaves unconsolidated.
- **How.** The run is a task in its own imp, with `memory.recall` and `memory.consolidate` as its
  only tools. It reads active items, never the conversation. Pinned items join the run, and any
  change to one is flagged in the diff.
- **What it proposes.** One group of proposals, one per change: a merge of several items into one, a
  rewrite of one item, or a retirement of an item that a newer one contradicts or supersedes.
  Consolidation never forgets. Each change binds to the versions it read and fails as stale if any
  moved.
- **Provenance.** A merged item's source is the least trusted source among its inputs, and its
  evidence lists every input's evidence. A change that any outside-content input feeds is flagged in
  the diff.

The client shows the group as one diff with "approve all" for the group, and the owner can approve
or reject each change alone. Each approval is its own record bound to its change's action hash, as
for any digest approval under [0006](../../decisions/0006-approval-record.md).

A group with no changes writes a record and shows nothing. The run stops at the worker limits from
[tasks](../core/tasks.md#workers) by default, and proposes at most 30 changes, ranked by how many
items each touches.
