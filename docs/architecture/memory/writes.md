# Memory writes

A model write to memory applies at once only when the user's own typed words back it. Every other
write waits for the user's review as a memory proposal. `memory.remember` and `memory.edit` pass a
content gate, and `memory.retire` passes an intent gate. Each gate runs code checks on a quote from
a message the user typed, then asks a separate checker model whether the message asserts the memory.
The first check that fails ends the gate, and the write becomes a proposal with that check as its
review reason. A write that fails a check therefore waits for the user instead of failing, and
nothing the model writes reaches memory on the model's word alone. A pin waits for review too, and
an unpin applies at once, because it adds nothing to memory ([pins](#pins)).

[The memory store](./store.md) covers the items, versions and keys that a write changes. The gates
follow [0011](../../decisions/0011-memory-writes.md). [The memory writer](./writer.md) covers the
batched writer, and [memory consolidation](./consolidation.md) covers the weekly diff of merges,
rewrites and retirements.

## The content gate

`memory.remember` takes the memory text and a quote, and `memory.edit` takes the same with the item
and the version the thread read. An edit of a missing item or a moved-on version fails before any
check runs. The gate runs outside any database transaction, because the checker is a model call, and
runs these steps in order:

1. **Find the evidence.** The gate reads the user's latest messages in the calling thread, newest
   first, within a configurable window. The newest message that holds the quote as typed text backs
   the write. A write with no quote becomes a proposal. A message from another task is never
   evidence, so a quote found only in one, or a write that cites one, backs nothing.
   [Reading the log](./context.md#reading-the-log) covers a write that cites an older message.
2. **The quote check.** The quote lies wholly in text the user typed, outside any quoted block.
3. **The token check.** Every destination-like token in the memory text appears in the quote.
4. **The checker.** The checker model confirms that the message asserts the memory.
5. **Apply.** nixie writes the version, its record and the turn's notice entry in one transaction.

A write from a memory writer batch skips the first step: the one message it cites is its evidence,
and [the memory writer](./writer.md#publishing) covers how its batch publishes it.

A memory text that holds a Unicode format character, such as a zero-width space or a bidirectional
control, fails before any check runs.

### End times on writes

`memory.remember` and `memory.edit` take an optional [end time](./store.md#end-times), an ISO time
with an offset, when the quoted message says when the fact stops being true. The tool descriptions
set how a stated time limit resolves: in the zone the user sent the message from, from the time they
sent it, never from the time of the write. "This week" ends at the end of its Sunday, a named day at
the end of the next such day, and a vague span such as "for a while" gives no end time. An edit
without an end time keeps the item's, and an edit with a null end time clears it. The quote must
back the time limit as well as the fact, so a new or moved end time passes the same gate as new
text. An end time that has passed fails as a tool error and writes nothing.

A message that backed an item the user later forgot never backs a write again. The forget records
the sequences of its evidence messages, and a quote found only in those messages becomes a proposal
with the forgotten-evidence reason. A model that read a forgotten fact earlier in the thread
therefore cannot write it back by quoting the same message.

### The quote check

The quote and each message compare in Unicode NFC with every run of whitespace collapsed to one
space, and case, punctuation and spelling must match. A match starts and ends on grapheme
boundaries, so it maps back onto the spans the client recorded. Every character of the match lies in
a span the client labelled typed, and a pasted, dropped or unknown character fails it. Any one typed
occurrence passes, so a pasted copy elsewhere in the message never hides it.

A match inside a blockquote, a code fence, or below a reply or forward header fails, because the
user did not write those words as their own. Inline quotation marks are left to the checker. A quote
that holds a Unicode format character fails, so an invisible character never splits a word that the
token check compares.

### The token check

Code finds each destination-like token in the memory text and requires it in the quote: email
addresses, URLs, bare domains, handles, phone numbers and account numbers, each compared in its own
normal form. An account number is an IBAN, an Australian BSB with its account number, or a run of
digits right after a word such as "account number", so a short domestic account number counts even
where it looks like no phone number. A lookalike letter from another script fails every comparison.
The token check stops the most harmful poisoned memory, one that points nixie at an attacker's
destination, whatever the checker answers.

### The checker

The checker is one model call with no tools, in its own long-lived sandbox on the conversation
image, on the checker role's [model profile](../core/model-profiles.md). Its input is the time and
the zone the user sent their one message in, then the message, with the quote marked as evidence and
every pasted span marked, then the memory text. The evidence mark avoids a quotation word, because
the checker read words marked as a quote as someone else's speech. The checker sees no other
message, no reply and no tool result, so outside content reaches it only as a marked span of the
user's own message. The checker's prompt names the user the way the writer does, so its examples
read like the memories it judges. The user writes to the assistant, so the prompt reads "you" in the
message as the assistant: a memory about the user never takes a fact the message states about the
assistant, and a shared memory needs the user to state it.

A write with an end time adds that end time to the checker's input, in the message's zone, and the
checker answers asserted only when the message states both the fact and a time limit that gives that
end time under the conventions the tool descriptions set.

It answers asserted, not asserted or unsure, with a reason, and only asserted lets a write apply. A
timeout, an error or an unreadable answer reads as unsure, so the checker fails closed. The answer's
verdict, the checker's model ID, any failure, and the hash of the definitions snapshot whose checker
prompt ran join the version's checks. The reason is free text that may repeat the memory, so it
reaches only the sealed proposal.

A seed can put a new snapshot in force while the checker runs, and that snapshot can hold another
checker prompt. The write transaction refuses a pass whose checker ran under a snapshot that is no
longer in force, so every applied version carries the verdict of the checker in force at its write.
A write tool call then runs its gate again under the new snapshot. The memory writer drops the batch
and gates it again on its next step.

Each checker prompt joins the policy snapshot as the SHA-256 of its text, so a release that changes
a prompt, or a change to the user's name, changes the snapshot hash that every record carries. The
[memory checker eval](../../../evals/memory-checker/README.md) replays a labelled corpus through the
production prompt and the input the gate renders. The checker writes its reason before its verdict,
so the verdict follows from the reasoning. On cases written after the tuning, it confirmed a fact
that a question only presupposes, so the checker narrows what applies at once without closing every
case, and the quote and token checks keep their place in front of it.

## Retirement intent

`memory.retire` takes an item, the version the thread read and an intent quote, with no replacement
text. The intent gate runs these steps:

1. **The read check.** A recall record shows that the calling thread received the item at that
   version. A target the thread never read becomes a proposal with the ambiguous-target reason.
2. **The quote check.** The intent quote lies in the user's typed text, under the quote rules.
3. **The checker.** The checker, under its retirement prompt, sees the user's message and the item's
   text, which it reads as untrusted data, and confirms that the user asked to retire that item or
   said the fact stopped being true.

The token check never runs on a retirement, because a retirement adds no text. The retirement
version copies the stored text with that text's source and evidence, and records its own intent
quote and checks beside them.

## Pins

`memory.pin` asks to add an item the model already has to
[the pinned core](./context.md#the-pinned-core), by the item and the version the thread read. A pin
is a proposal of its own with the pinned reason, because the core opens every session and costs
every turn that reads it, so the user decides what goes in. No quote backs a pin and no checker
judges one: a pin adds no text, so the gate has nothing of the user's to check. `memory.remember`
takes no pin, so a new fact that the model wants pinned is a remember and then a pin. The remember
passes [the content gate](#the-content-gate) like any other, and the pin waits for the user's review
unless an allow rule names `memory.pin`.

A pin of a retired item, a forgotten one or a moved-on version fails before anything is written. An
active item past its [end time](./store.md#end-times) counts as retired, so its pin fails the same
way. A pin of an item already in the core applies at once and writes nothing. An approval pins the
item through the store, bound to the proposal's version, so an approval fails as stale once the item
moved on, fails as retired once its end time passed, and fails with `PINNED_CORE_FULL` when the core
has no room left in its budget. The approval and the pin record commit together, and a rejected or
lapsed pin leaves the core as it was.

`memory.unpin` takes an item out of the core at once and needs no review, because the item stays in
memory and recall still finds it. It writes the pin record that the user's own unpin writes, with
the calling thread, and adds no version, so the store's undo never reaches it and the user pins the
item again from the memory view. An unpin of an item outside the core fails and writes nothing. The
next turn's change note names the unpinned item ([the pinned core](./context.md#the-pinned-core)).

The memory writer never pins, and its edit of a pinned item waits for review even when every check
passes ([publishing](./writer.md#publishing)).

## Sensitive marks

`memory.mark_sensitive` marks an item [sensitive](./store.md#sensitive-items), or clears the mark,
by the item alone. The mark applies at once and needs no review, because it changes no text and the
item stays in memory, where the model's own recall still finds it. It records the calling thread,
adds no version, and fails on a forgotten item. The user changes the mark again from the memory
view.

The memory writer marks only a new item, and that item waits for review with the sensitive reason
even when every check passes ([publishing](./writer.md#publishing)). The proposal carries the mark
in a record of its own, and an approval marks the item in the transaction that creates it. A pending
proposal merges only with one that carries the same mark.

## Self-notes

A self-note is an item whose subject is self: nixie writes it about itself, in its own voice, such
as its tastes or how something landed with the user, and every one waits for the user's review. An
item takes its subject when it is created, and only an approved [subject change](#subject-changes)
moves it to another, so an edit that keeps a self-note's subject is a self-note write. The
conversation's `memory.remember` takes the subject. A shared item runs through the same gate as an
item about the user, so it needs a quote of the user's own typed words to apply at once.

Nothing of the user's backs a self-note, so the quote check and the checker have nothing to judge,
and the gate skips both. It runs the hidden-character check and the token check, which compares the
note's destination-like tokens against everything the user typed in the window, as under an allow
rule. The write then becomes a proposal with the self-note reason whatever the token check found,
and the proposal's checks keep the token verdict, so the review shows a destination the user never
typed. An approved self-note takes outside content as its source.

Only the conversation creates a self-note, because only a persona thread speaks as nixie. A
self-note write from a task or from the memory writer fails before any check runs and writes
nothing, and so does the memory writer's edit of a self-note. The memory writer's tools take no self
subject, and the writer [flags a possible self-note](./writer.md#flags-of-possible-self-notes) for
nixie to write instead. A self-note takes a pin as any other item does ([pins](#pins)). A proposal
merges only with a pending proposal of the same subject, and its close match on approval looks only
at items of its own subject, so an item about the user never revises a self-note.

The conversation's retire of a self-note skips the intent gate and applies at once, with a notice
entry whose undo brings the note back. The retire needs no quote, and its version records no intent
quote even when the call passes one, because no words of the user's back it. A retirement only
narrows what the conversation reads, and the note was nixie's own. A task's retire of a self-note
runs the intent gate as any retirement does.

## Subject changes

`memory.edit` takes an optional subject, and a subject other than the item's own moves the item to
that subject, so nixie can fix an item filed under the wrong one. A subject change changes whose
fact the item is, so it always waits for the user's review. The gate runs the checks of the subject
the item moves to: a move to self runs the self-note checks, and a move to owner or shared needs a
quote as any edit does. A write that passes every check still becomes a proposal, with the subject
change reason, and a write that fails a check keeps that check's reason. An edit that passes the
item's own subject is a plain edit.

A move into self is a self-note write, so only the conversation makes one, and a move out of self is
an edit of a self-note, which the memory writer never makes. The memory writer's edit refuses any
subject other than its item's own ([a batch's session](./writer.md#a-batchs-session)). To split an
item that holds two subjects, nixie edits it down to one fact and stores the other as a new item,
and each waits for review on its own.

The proposal holds the subject its item has and the subject the item moves to. The second sits in a
record of its own after the proposal record, for the reason that a subject mark does
([the memory store](./store.md#items-and-versions)). A pending edit merges only with one that makes
the same move, or with one that makes none when it makes none. An approval writes the new version
and a subject change record for its item in one transaction, and checks the pinned core budget
against the subject the item moves to.

The subject change record names the version that made the move and the subject the item had before
it, and the store keeps that subject on the version. An undo of a version that moved the item moves
it back to that subject, with a subject change record of its own, so an undo of that undo moves the
item again.

## Writes from a photo

Memory never holds an image or a description of one: the writer and the log reader see only a marker
where the user attached an image. The conversation sees the image itself, and saves what it shows
through `memory.remember` as it saves any other fact, with an image source: the event ID of the
user's message that holds the image and the image's number in that message. The gate refuses an
image source that does not name an image of one of the user's readable messages in the write's
thread, and writes nothing.

A photo never counts as the user's words, and neither does text the model reads inside one. The gate
therefore skips the quote check and the checker for a write from a photo, whatever quote the write
gives, and the proposal keeps no quote. It runs the hidden-character check and the token check, as
for a self-note, and the write becomes a proposal with the photo reason. The proposal's checks name
the image, and the [proposals page](./view.md#proposals) shows the photo beside the text.

An allow rule covers a write from a photo only when the rule names the image source. A rule on
`memory.remember` alone leaves the write a proposal. A rule that names the image source lets the
write apply at once under the rule's token check, with outside content as its source. A version from
a photo keeps the image in its checks and takes outside content as its source, even when the user
approves an edit of its text.

The recall tool returns that image source beside each version from a photo, as the event ID and the
image's number, so the conversation can open the photo with the
[log image tool](./context.md#reading-the-log) when it needs to see it. The item's history on the
[memory page](./view.md#an-items-history) shows the photo beside the version.

### Image offer records

The log of a deployment that ran an earlier release can hold image offer records. Each one seals a
sentence that the model offered to save from an image under the record's own key, and no tool writes
one. A forget of the image's message removes the key of every offer record for its images, so no
offer record keeps a sentence that never saved. A saved sentence lives on under its item's key, and
its version's checks name the offer record. Store start removes the key of each such offer record
that the key store still holds, so a forget of the saved item leaves no offer record readable
either. The reply that presented an offer holds its sentence too, and that reply is part of the
user's conversation, so only a forget of the reply itself removes that copy.

## Provenance

nixie sets every provenance field from the calling step, never from the tool's arguments: the origin
from the run's thread, the task, and the model ID of the call that asked. A version that the memory
writer applies names the model of its batch's session. The checker's verdict among the checks names
the checker's model. A version that no checker judged names no checker model: a write whose token
check failed, which stops before the checker, or an edit of a self-note, which goes to review before
any check of its quote. A version whose checks all passed takes the user's words as its source and
holds each check's verdict. Any other write has no version until the user approves it.

A version's source labels its text, never its evidence. A proposal takes outside content as its
source even when its quote lies in the user's message, because no check tied the text to the quote:
the text holds a token the quote lacks, the checker did not confirm the claim, or the write edits a
self-note, which always waits for review. The user's approval keeps that source. The approval
confirms that the user wants the text kept, and never that the user typed it, so the conversation
reads the item as unconfirmed and approved ([how an item reads](./context.md#how-an-item-reads)). An
approval of the user's own edit takes the user as its source, because the words are then the user's.
One exception: an edit of a proposal from a photo keeps outside content as its source, because the
fact still comes from the photo.

The user's allow rule on a content-gate tool lets a write through that tool skip the quote and the
checker. The gate looks up the rule by the tool the write came through, `memory.edit` for a write
that names an item and `memory.remember` for a new item, so a rule on one tool never covers the
other. The rule never skips the token check, which then compares against everything the user typed
in the window. No quote of the user's backs such a write, so its source is outside content. An allow
rule that names `memory.pin` lets a pin apply at once with no proposal, and a rule on either content
tool never covers a pin. The policy engine has no user rules, so the gate finds no allow rule and
every write runs the full gate.

## Memory proposals

A write that fails a gate becomes a memory proposal, bound to its exact operation: the text, the
quote, the end time and the target version for a remember, the intent quote and the target version
for a retirement, or the target version for a pin, whose text is the item's text at that version.
The proposal's text, quote and checker reason are sealed under the item's own key, and a proposal
for a new item creates that item's key. A forget of the item therefore makes its proposals
unreadable too. The plain columns hold the review reason, the checks and the provenance, so a count
of proposals by review reason decrypts nothing. The proposal record and its column keep the reason
word for word, and every reader shows a reason the release does not know as `other`, because a
rollback leaves a later release's proposals in the log and the table.

The user approves, edits or rejects each proposal against the hash of the operation they saw, and a
hash that no longer matches refuses the answer. An approval applies the bound operation and records
the approval with the version. An edit approves the user's own text instead, so that version takes
the user as its origin and cites no evidence. It takes the user as its source too, except for a
write from a photo ([provenance](#provenance)). A retirement takes no edit, and neither does a pin.
An approval of a proposal whose item moved on fails as stale and applies nothing, and the proposal
stays pending so the client can offer it against the current version. A rejection takes the user's
reason when they give one. The reason is free text, so it sits in the rejection record's erasable
fields under that record's own key, and a rejected new item keeps its reason after the rejection
deletes the item's key.

A write that proposes the same change as a pending proposal merges into it instead of adding a
second proposal. The same change means the same operation on the same target, or on a new item for
both, with the same end time and the same text once case, spacing and a closing full stop are set
aside. The check runs inside the write's transaction, so two writes of one fact never both miss it.
Each proposal's text is sealed under its own item's key, so the check opens the text of each pending
candidate rather than comparing a stored digest, which would outlive a forget. A merge records the
second proposer against the proposal and adds no proposal against the cap. It moves the proposal's
lapse to a full lapse window from the merge, so a fact proposed again never lapses sooner than a
proposal of its own. The listing shows every source that proposed the change, and the second
proposer's result says that it merged. A conversation whose proposal another source proposed again
learns of it from an event in [the events block](./writer.md#changes-the-conversation-hears-of). A
reworded fact stays a proposal of its own: wording that differs is the model's to reconcile.

An approval of a proposal for a new item first searches the retrieval index with its text. When an
active item shares enough of the proposal's content words, the approval holds, applies nothing and
names that item, because applying would leave 2 active items that state one fact. The user then
answers again: as a revision of that item, which writes the proposal's text as its next version and
drops the proposal's own key, or as a new item anyway. How much wording counts as close is a
configurable share.

A proposal lapses after a configurable time, or at its end time when that comes first, so an
approval never applies a fact that has already ended. A server sweep lapses each overdue proposal. A
conversation turn, a task run or a writer batch makes at most a configurable number of proposals,
and the next one refuses, so an injected instruction cannot flood the user's review. A lapsed or
rejected proposal for a new item deletes that item's key, because the proposal held its only
reference, and so does an approval that applies it as a revision of another item. The key goes after
the close commits, so store start and each lapse sweep delete any key that a crash or a failed
deletion left behind.

## Notices

Each applied write and each proposal adds an entry to its group's notice: one conversation turn,
keyed by the user's newest message in the thread, or one task run. The memory writer posts a notice
record of its own for each live batch and for the end of its [catch-up](./writer.md#the-catch-up),
which holds a count and no entries. The API lists a thread's notices of both kinds with each entry's
current item, and the client shows a turn's notice under the turn's last reply and any other notice
after the newest record its writes followed. A notice shows its counts on one muted line and opens
to its entries, and each entry links to its item in the memory view, or to the proposals page for a
proposal. An entry whose item has an end time shows the date the fact lasts until.

An entry whose item still stands at the version it wrote offers undo, keep and retire, each one tap
and each a [checked action](../channels/api.md#checked-actions) bound to that version. An item that
changed after the notice therefore refuses the change as stale, and nothing commits. Undo writes the
store's undo version, and retire writes a retirement. Keep writes no version: its client action
result is the record that the user kept that version, and the API reads it back to mark the entry
kept. An entry whose item moved past its version shows the item as undone, retired or changed.
