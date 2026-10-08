# Memory writes

- Status: Proposed
- Decisions: [0002](../../decisions/0002-approvals.md),
  [0006](../../decisions/0006-approval-record.md), [0010](../../decisions/0010-memory-store.md),
  [0011](../../decisions/0011-memory-writes.md), [0015](../../decisions/0015-taint-scope.md),
  [0024](../../decisions/0024-memory-in-context.md)

A memory write applies at once, with a notice and undo, only when 3 checks pass under
[0011](../../decisions/0011-memory-writes.md): an exact quote from text the owner typed backs it,
every destination-like token in it appears in that quote, and a checker model that sees the owner's
whole message confirms the owner asserted it. Every other write becomes a memory proposal on the
digest sheet. The checks run inside the memory tools, after the
[policy decision point](../policy/decision-point.md) has allowed the call, so a write that fails a
check is held for review rather than refused. Consolidation, which rewrites many items at once, is
always a proposal. Everything in this doc beyond the decisions it links is a proposal.

## Who writes

2 paths call the memory tools, as the owner decision on who writes memory in
[the store](./store.md#decisions-for-the-owner) recommends:

- **The conversation and tasks** call `memory.remember` and `memory.retire` during a turn, such as
  when the owner says "remember that I'm vegetarian now".
- **The memory writer** is a nixie step that runs after each conversation turn commits. A small
  model reads the owner's messages from that turn, the reply, and the items that retrieval found for
  them, and calls `memory.remember` for each fact the owner stated, with an exact quote for each. It
  holds only `memory.recall`, `memory.remember` and `memory.retire`. **Why:** the model-eval spike
  found that a writer prompted for an exact owner quote per entry invented nothing on Haiku 5.5,
  Muse and Luna, where a plain summary prompt invented facts on every model
  ([model-eval](../../../spikes/model-eval/README.md#a-required-owner-quote-stops-invented-memory)).

The writer runs in its own imp like any worker under
[0026](../../decisions/0026-where-workers-and-the-conversation-run.md), because it reads the
conversation's reply, which can carry outside content. It runs in the background and never delays
the reply. Its model follows the deferred model-per-job choice in
[open items](../open-items.md#deferred-decisions), with Haiku 5.5 at low effort as the default from
the spike.

A write whose text matches an active item exactly, after the [matching](#the-quote-check) rules,
returns that item and writes nothing, so the 2 paths never store one fact twice. A near-duplicate is
the model's job: the writer sees the items retrieval found and revises one rather than adding a
second. A fact that replaces another, such as a new address, revises the old item or retires it.
**Why:** the [retrieval spike](../../../spikes/memory-retrieval/README.md) found that no ranking
separates a current fact from the one it superseded, so the store must not hold both as active.

## The gate

`memory.remember` and `memory.retire` run these steps in order. The first check to fail ends the
gate, and the write becomes a proposal with that check as its review reason:

1. **Find the evidence.** nixie searches the owner messages of the calling thread for the quote,
   newest first, up to the last 20 owner messages by default. A write with no quote skips to the
   proposal.
2. **The quote check.** The quote lies wholly in typed text outside any quoted block, as
   [the quote check](#the-quote-check) sets out.
3. **The token check.** Every destination-like token in the memory text appears in the quote.
4. **The checker.** A checker model confirms that the owner asserted the memory.
5. **Apply.** nixie writes the version, its record and a notice to the owner in one transaction.

The window of 20 messages is configurable. **Why:** a fact the owner stated a few turns earlier
still counts, while a match far back is more likely a coincidence than evidence. A job run has no
owner messages, so every write from a job run is a proposal, which 0011 requires for facts that
reach nixie only through outside content.

The checks run in the tool, not in the decision point's pipeline. The decision point decides whether
the call may run, and the `note` effect is allowed by the starter rules; the gate decides whether
the change it makes needs review. A rule the owner writes can still ask for or deny
`memory.remember`, and then the decision point's answer applies before the gate runs.

A write that asks to pin its item always becomes a proposal, whatever the checks say. The owner pins
directly in the client. **Why:** a pinned item rides in the system prompt of every turn of every
task, so model-chosen text gets there only with the owner's approval.

### The quote check

The [checks spike](../../../spikes/memory-checks/README.md) wrote the quote check and the token
check as code and ran them over 26 sample messages, and every case gave the expected verdict. The
rules it settled:

- **Matching.** The quote and the message compare in Unicode NFC, with each run of whitespace
  collapsed to one space, and nothing else relaxed: case, punctuation and spelling must match. The
  message is normalised one grapheme at a time, so a match maps back onto the spans the client
  recorded.
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

| Token          | Compared                                                       |
| -------------- | -------------------------------------------------------------- |
| Email address  | Without case                                                   |
| URL            | Scheme and host without case, path exactly                     |
| Bare domain    | Without case, anywhere in the quote                            |
| Handle         | Without case                                                   |
| Phone number   | Digits only, so separators may differ and nothing may be added |
| Account number | IBAN-style letters and digits, spaces dropped                  |

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

## Provenance

nixie sets every provenance field of a version from the calling step, never from the tool's
arguments. The source follows one rule: a version whose quote, token and checker checks all passed
has the owner's words as its source; any other version has the least trusted source in the calling
task's context. The conversation is always untrusted under
[0015](../../decisions/0015-taint-scope.md), and every job run is untrusted in the first build, so a
proposal from either carries outside content as its source. An approved proposal keeps that source:
the owner's approval records that the owner accepted the text, in the proposal and approval fields,
and does not rewrite where the text came from.

**Why:** a later review of poisoned memory, or a consolidation that drops outside candidates, needs
the source as it was when the text entered nixie.

## Memory proposals

A write that fails the gate becomes a proposal in the
[proposals projection](../policy/approvals.md#the-proposal), in the routine class, so it gathers on
the digest sheet with the other routine items. Its canonical action is the tool, the memory text,
the evidence quote and the item version it revises, so an approval binds to that exact text. Its
sentence comes from the tool's template, such as "Remember: the owner's mobile is 0412 345 678",
shown with its evidence quote inside the owner message it came from, or with "no owner quote".

A memory proposal is not one of the 5 prompt causes from
[0005](../../decisions/0005-effects-and-taint.md), because the gate raises it, not the decision
point. It carries a review reason instead:

- no quote, or a quote outside the window
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

A write that applied at once reaches the owner as a notice, under 0011. The notice is a record in
the thread that made the write, which the client renders as a compact line under nixie's reply, such
as "Remembered: dentist is Dr Okafor", with undo, as the owner decision on notices in
[the store](./store.md#decisions-for-the-owner) recommends. A write from a task appears in that
task's thread and in the conversation's next report from it.

Undo is a checked action. It adds a version with the text before the write, or retires the item when
the write created it, so undo itself is recorded and can be undone. Purge, the one-tap removal from
0011, is the forget action in [the store](./store.md#forgetting).

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
