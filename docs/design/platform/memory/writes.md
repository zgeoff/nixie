# Memory writes

- Decisions: [0002](../../../decisions/0002-approvals.md),
  [0006](../../../decisions/0006-approval-record.md),
  [0011](../../../decisions/0011-memory-writes.md), [0015](../../../decisions/0015-taint-scope.md),
  [0031](../../../decisions/0031-memory-capture-context-and-removal.md)

A write that introduces memory text applies at once, with a notice and undo, only when 3 checks
pass: an exact quote from text you typed backs it, every destination-like token in it appears in
that quote, and a checker model that sees your whole message confirms you asserted it. An allow rule
of yours on `memory.remember` lets a write skip the quote and the checker, and never the token
check. Every other write becomes a memory proposal in the approval digest. The checks run inside the
memory tools, after the [policy decision point](../policy/decision-point.md) allows the call, so a
write that fails a check waits for review instead of failing.

## Who writes

Memory has 2 write paths, and SDK compaction stays in place:

- **The conversation and tasks** call `memory.remember` and `memory.retire` during a turn, such as
  when you say "remember that I'm vegetarian now". These writes never wait for a batch.
- **The memory writer** captures passing facts from batches of committed conversation turns. A small
  model reads your original messages in order, the replies, and the relevant current items. Its only
  tools are `memory.recall`, `memory.remember` and `memory.retire`, and it supplies an exact quote
  for each candidate.

The writer starts a batch on a count of unprocessed messages, idle time or the age of the oldest
unprocessed message. The defaults are 4 messages, 5 minutes idle and 20 minutes maximum age, all
configurable. The age limit keeps capture moving while replies keep a conversation busy. A summary
is never evidence for a memory.

The writer runs in its own imp like any worker, under
[0026](../../../decisions/0026-where-workers-and-the-conversation-run.md), because the replies it
reads can carry outside content. It runs in the background and never delays a reply. Its model comes
from the `memory-writer` role's [model profile](../core/models.md#roles).

A write whose text matches an active item exactly returns that item and writes nothing. A
near-duplicate is the model's job: the writer sees the items retrieval found and revises one instead
of adding a second. A fact that replaces another, such as a new address, revises or retires the old
item. **Why:** the [retrieval spike](../spikes/memory-retrieval/README.md) found that no ranking
separates a current fact from the one it superseded, so the store never holds both as active.

### Batch boundaries and recovery

A batch covers the committed turns after the writer's cursor, up to a fixed record sequence.
Messages that arrive while it runs wait for the next batch. The host gives the writer the eligible
messages with their record IDs. A candidate's evidence holds the ID of one of those records, and the
host resolves it and sets provenance itself.

The writer's tools stage candidates instead of applying them. A batch holds at most one revision per
item, and 2 candidates that revise the same item reject the batch and retry with that feedback. The
host runs the gate outside the database transaction. It then publishes the writes or proposals,
their notices and the advanced cursor in one transaction, after it checks that every source is still
readable and every revised item is still at the version read. A source forgotten during extraction
never publishes.

A crash before publication retries the batch, and a crash after it resumes from the committed
cursor, so extraction can repeat but its effects never do. A failed check produces a proposal, and
the cursor never skips a candidate. The [offline batch spike](../spikes/memory-batch/) tests this
cursor under process kills.

## The content gate

`memory.remember` runs these steps in order. The first check that fails ends the gate, and the write
becomes a proposal with that check as its review reason:

1. **Find the evidence.** A conversation or task write searches the thread's last 20 messages from
   you, newest first, a configurable window. A batch write resolves its selected source record. A
   write with no quote becomes a proposal.
2. **The quote check.** The quote lies wholly in typed text outside any quoted block.
3. **The token check.** Every destination-like token in the text appears in the quote.
4. **The checker.** A checker model confirms that you asserted the memory.
5. **Apply.** nixie writes the version, its record and a notice in one transaction.

A job run has no messages from you, so every write from a job run is a proposal unless your allow
rule covers job runs. A write that pins its item is always a proposal, and you pin directly in the
client. **Why:** a pinned item rides in the system prompt of every turn of every task, so
model-chosen text gets there only with your approval.

A rule of yours can ask for or deny `memory.remember` or `memory.retire`. The decision point runs
first, then the content gate for a remember or the intent gate for a retirement.

### Your allow rule

An allow rule of yours whose tool field names `memory.remember`, such as "remember facts from the
conversation without asking", changes the content gate in the contexts it names. A rule that matches
the `note` effect alone, such as the starter `allow-notes`, lets the call run and leaves the full
gate in place, and no starter rule names the tool. A decision records only its deciding rule, so the
gate itself looks for an allow rule that names the tool and matches the call, and takes this path
when it finds one:

1. **The token check.** Every destination-like token in the text appears word for word in text you
   typed outside pasted spans and quoted blocks, in any message nixie recorded, or in your
   definitions.
2. **Apply.** nixie writes the version, its record and a notice in one transaction.

A write that fails the token check becomes a proposal with that check as its review reason. A write
that applies under the rule records the rule's ID, and its provenance is the least trusted source in
the calling task's context, because no quote of yours backs it. A pinning write stays a proposal.
Creating the rule is a widening under [0005](../../../decisions/0005-effects-and-taint.md), so it
asks once. **Why:** you choose where memory forms without review, and a memory that points nixie at
a destination you never typed still waits for you.

### The quote check

The [checks spike](../spikes/memory-checks/README.md) tested these rules:

- **Matching.** The quote and the message compare in Unicode NFC with each run of whitespace
  collapsed to one space. Case, punctuation and spelling must match. A match starts and ends on
  grapheme boundaries, so it maps back onto the spans the client recorded.
- **Typed text only.** Every character of the match lies in a span the client labelled `typed`, as
  the [client design](../channels/client.md) records spans. A pasted, dropped or unknown character
  fails the match. Any one typed occurrence passes, so a pasted copy elsewhere never hides it.
- **Quoted blocks.** A match inside a blockquote, a code fence, or below a reply or forward header
  such as "On … wrote:" fails. Inline quotation marks are left to the checker.
- **Invisible characters.** A quote or text that holds a Unicode format character, such as a
  zero-width space or a bidirectional control, fails.

### The token check

Code finds the destination-like tokens in the memory text and requires each one in the quote:

| Token          | Compared                                                                    |
| -------------- | --------------------------------------------------------------------------- |
| Email address  | Without case                                                                |
| URL            | Scheme and host without case, path exactly, found before an email inside it |
| Bare domain    | Without case, equal to a host in the quote                                  |
| Handle         | Without case                                                                |
| Phone number   | Digits only, against each number in the quote                               |
| Account number | IBAN-style letters and digits, spaces dropped                               |

A lookalike letter from another script fails every comparison. **Why:** the token check stops the
most harmful poisoned memory, one that points nixie at an attacker's destination, whatever the
checker says. The patterns grow with the destination arguments that tools declare to the
[decision point](../policy/decision-point.md).

### The checker

The checker is a separate model call that sees only your message, with the quote and every pasted
span marked, and the memory text. It answers asserted, not asserted or unsure, with a reason, and
only "asserted" lets the write apply. A timeout of 10 s by default, an error or an unreadable answer
counts as unsure. **Why:** a negation ("I don't use old@example.com any more"), a question and a
quoted remark all pass the code checks, and only a model reading the whole message tells them from a
statement.

The checker shares its implementation with the consent checker in the
[decision point](../policy/decision-point.md), with its own prompt, which is part of the policy
snapshot.

## Retirement intent

"Forget that" in chat retires the item, and only a checked action in the client destroys one.
`memory.retire` takes an item ID, the version read and an intent quote, with no replacement text.
The host checks that the calling session read that item at that version. An ambiguous target becomes
a proposal.

The intent quote lies wholly in your typed text outside quoted blocks, under the quote rules. A
checker sees your message, the intent quote and the bound item's text labelled as untrusted data,
and confirms that you asked to retire that exact item, or said the fact stopped being true. A
timeout, an unsure verdict or a failed check produces a proposal.

The token check never applies to a retirement, because it introduces no content. You never repeat an
old phone number to retire it. The retirement version copies the stored text with its content
provenance, and records its own actor, task and intent separately. A stale version fails before the
state changes. Restore and undo stay checked client actions.

## Provenance

nixie sets every provenance field from the calling step, never from the tool's arguments. A version
whose content checks all passed has your words as its source. Any other version has the least
trusted source in the calling task's context. The conversation is always untrusted under
[0015](../../../decisions/0015-taint-scope.md), and so is every job run, so a proposal from either
carries outside content as its source.

An approved proposal keeps its source, and the approval fields record that you accepted the text.
Retirement, restore and undo keep the copied content's source and evidence. **Why:** a review of
poisoned memory needs the source as it was when the text entered nixie.

## Memory proposals

A write that fails the gate becomes a routine proposal in the approval digest, bound to its exact
operation: the text, evidence quote and target version for a remember, or the intent quote and
target version for a retirement. Its card shows the quote inside its source message, or "no quote
from you". A memory proposal carries one review reason:

- no quote, or a quote outside the window or batch
- an ambiguous retirement target
- a quote outside typed text, or inside a quoted block
- a token missing from the quote
- the checker said not asserted, said unsure, or could not be reached

A memory proposal is not a prompt cause under [0028](../../../decisions/0028-policy-design.md), and
the live view counts proposals by review reason. **Why:** the counts show which check sends the most
writes to review.

You approve, edit or reject each proposal, and an edit approves your own text instead. An approval
of a proposal whose item moved on fails as stale, and the client offers it against the current
version. Defaults, all configurable:

- A memory proposal lapses after 14 days, because a fact rarely goes stale in the 72 hours that
  actions use.
- A task run proposes at most 10 memory writes, so an injected instruction cannot flood the approval
  digest.
- Stopping a task withdraws its open memory proposals with its other proposals.

## Notices and undo

The client groups one turn's writes, or one batch's writes, into a compact notice under the reply:
"Remembered 3 things · View" expands to the items, each with undo bound to the version written.
Retirement uses the same grouping with its own label. A batch that finishes after the reply adds a
quiet notice in that thread, with no push and no entry in the approval digest. A task's writes
appear in its thread and in its next report to the conversation.

Undo is a checked action. It adds a version with the earlier text, or retires an item that the write
created, so undo itself can be undone. A later edit makes an old notice's undo stale. A notice also
links the checked [forget](store.md#forgetting) action.

## Consolidation

Consolidation comes after the first build. It runs weekly by default as a system task in its own
imp, with `memory.recall` and `memory.consolidate` as its only tools. It reads active items, never
the conversation, and proposes merges, rewrites and retirements as one diff, at most 30 changes. It
never forgets. Each change binds to the versions it read, and a merged item takes the least trusted
source among its inputs. You approve the whole diff or each change alone, and each approval is its
own record under [0006](../../../decisions/0006-approval-record.md).
