# Memory writes

A model write to memory applies at once in 2 cases: the user's own typed words back it, or an allow
rule of the user's covers it ([rules on memory writes](#rules-on-memory-writes)). Every other write
waits for the user's review as a memory proposal. With no covering rule, `memory.remember` and
`memory.edit` pass a content gate, and `memory.retire` passes an intent gate. Each gate runs code
checks on a quote from a message the user typed, then asks a separate checker model whether the
message asserts the memory. The first check that fails ends the gate, and the write becomes a
proposal with that check as its review reason, so nothing the model writes reaches memory on the
model's word alone. A pin of an item outside the pinned core waits for review unless an allow rule
covers it, and an unpin applies at once ([pins](#pins)). A write from a task passes the same gates
as a write from the conversation.

A few writes fail outright instead. The tool returns an error to the model, and nothing is written:
no item, no version and no proposal. These are:

- a call that a deny rule matches ([rules on memory writes](#rules-on-memory-writes));
- a text longer than its subject allows: 6,000 characters for a [self-note](#self-notes) and 2,000
  for an item about the user or a shared item. An edit is held to the subject it passes, or else to
  the item's. The tool answers with the length and how far it runs over, such as
  `data/text is 2,347 characters, 347 over the 2,000 limit`. nixie holds the user's own edits and
  edited approvals to the same limits, and refuses an over-long one with `TEXT_TOO_LONG`;
- an edit, retirement or pin of a missing or forgotten item, or at an outdated revision;
- an edit with no text and no label;
- an edit of labels only that also passes a quote, an event ID, an end time or a subject, because
  each of those backs or changes text, and the edit has none;
- an end time that has already passed;
- a task's write that creates a self-note, edits one, or moves an item into or out of self, when no
  allow rule covers it ([self-notes](#self-notes));
- an image source that points at no image of the user's in the thread;
- a quote or an event ID that cites a message whose removal from the event log has begun
  ([forgotten evidence](#forgotten-evidence));
- a proposal for an item whose [evidence purge](./store.md#the-evidence-purge) has not finished, or
  one past the [proposal cap](#memory-proposals);
- an edit of a pinned item that would apply with text that no longer fits the pinned core's budget.
  An edit that goes to review instead fails the same way when the user approves it;
- a pin of a retired item, a pin that a rule applies when the core has no room, and an unpin of an
  item outside the core ([pins](#pins)).

[The memory store](./store.md) covers the items, versions and keys that a write changes, and
[0008](../../decisions/0008-memory-write-review.md) records the choice of gates.

## The content gate

`memory.remember` takes the memory text, its labels, a quote, and the event ID of the message the
quote comes from, as the message's [stamp](../connectors/time.md#the-send-time-on-each-message) or a
`log.read` entry shows it. The labels are a gist, a topic and up to 5 trigger phrases
([labels and the revision](./store.md#labels-and-the-revision)). It also takes an optional
[subject](#self-notes), [image source](#writes-from-a-photo) and [end time](#end-times-on-writes).
`memory.edit` takes the item and the revision the thread read, and the same arguments except the
image source. It keeps each label it leaves out.

The gate runs outside any database transaction, because the checker is a model call. For an item
about the user or a shared item, it runs these steps in order:

1. **The hidden-character check.** The text and the labels hold no Unicode format character, such as
   a zero-width space or a bidirectional control. A write that holds one becomes a proposal with the
   reason `invisible_character`.
2. **Find the evidence.** With an event ID, the gate reads that one message, from the thread whose
   log the caller may read: the calling thread, or the conversation's thread for a task started with
   the log grant ([start options](../core/started-tasks.md#start-options)). Without one, it searches
   the user's latest messages in the calling thread, newest first, within the evidence window, a
   configurable count, and the newest message that holds the quote as typed text backs the write. A
   write with no quote, or with a quote that matches no such message, becomes a proposal.
   [Reading the log](./context.md#reading-the-log) covers a write that cites an older message. A
   cited event that the readable thread lacks makes the write wait with `no_quote`, and so does an
   event on any other thread. A cited record that is not the user's message gives `quote_not_typed`,
   and a cited message that the user forgot, or that backed an item the user forgot, gives
   `forgotten_evidence`. A quote with no event ID searches the caller's own thread only, so an
   uncited quote from a task with the log grant waits with `no_quote`, and such a task must cite the
   event. The gate looks up a covering allow rule by the caller's own thread, whatever the grant.
   The grant changes where the gate looks for evidence, and nothing else.
3. **The quote check.** The quote lies wholly in text the user typed, outside any quoted block.
4. **The token check.** Every [destination-like token](#the-token-check) in the text and the labels
   appears in the quote, so a label never carries a destination that the text could not.
5. **The checker.** The checker model confirms that the message asserts the text.
6. **Apply.** nixie writes the version, its record and its [notice](#notices) entry in one
   transaction.

A matching ask rule sends the write to review before step 1, and a covering allow rule keeps step 1
and skips steps 2 to 5 ([rules on memory writes](#rules-on-memory-writes)). A self-note, a write
from a photo and a [subject change](#subject-changes) each run their own checks.

An edit with no text changes labels only. A quote backs text and never a label, so with no covering
allow rule the edit becomes a proposal. Its review reason is `labels`, or `invisible_character` when
a label holds a hidden character, and `ask_rule` under an ask rule. Its token check compares the
labels with the item's current text, and the proposal keeps that verdict. A covering allow rule
applies the labels at once, after the hidden-character check, with a [notice](#notices) entry.

### End times on writes

`memory.remember` and `memory.edit` take an optional [end time](./store.md#end-times), an ISO time
with an offset, when the quoted message says when the fact stops being true. Following the tool
descriptions, the model resolves a stated time limit in the zone the user sent the message in,
counting from the time they sent it. An edit without an end time keeps the item's, and an edit with
a null end time clears it. The quote must back the time limit as well as the fact, so a new or moved
end time passes the same gate as new text.

### The quote check

The quote and each message compare in Unicode NFC with each stretch of whitespace collapsed to one
space, and case, punctuation and spelling must match. Every character of the match lies in a span
the client labelled typed, and a pasted, dropped or unknown character fails it. Any one typed
occurrence passes, so a pasted copy elsewhere in the message never hides it.

A match inside a blockquote, a code fence, or below a reply or forward header fails, because the
user did not write those words as their own. Inline quotation marks are left to the checker. A quote
that holds a Unicode format character fails with the reason `invisible_character`, so an invisible
character never splits a word that the token check compares.

### Forgotten evidence

A message that backed an item the user later forgot never backs a write again. A forget of an item
records the event IDs of the messages that backed it, and a quote found only in those messages
becomes a proposal with the reason `forgotten_evidence`.

A record forget is a separate operation: it removes one message, or another record, from the event
log for good, and first commits a `record.forget_started` record that holds the sequence of the
record it removes ([forgetting a record](../channels/api.md#forgetting-a-record)). From then on, a
write that cites that message fails with `QuotedRecordForgettingError`, whether the gate found the
message for a quote or an intent quote, or the write passed its event ID. The write transaction
checks again, so a write that found its quote before the forget began fails too. nixie tells the
model, in the tool error, to write the fact again with no quote and no event ID, as a proposal.

### The token check

Code finds each destination-like token in the memory text and its labels, and requires it in the
quote. Each kind compares in its own normal form:

- email addresses;
- URLs and bare domains;
- handles;
- phone numbers;
- account numbers: an IBAN, an Australian BSB with its account number, or the digits right after a
  phrase such as "account number", so a short domestic account number counts even where it looks
  like no phone number.

A lookalike letter from another script fails every comparison. The token check stops the most
harmful poisoned memory, one that points nixie at an attacker's destination, whatever the checker
answers.

### The checker

The checker is one model call with no tools, in a sandbox of its own, on the checker role's
[model profile](../core/model-profiles.md). Its input is the time and the zone the user sent their
one message in, then the message, with the quote marked as evidence and every pasted span marked,
then the memory text, with its end time in the message's zone. The evidence mark uses no quotation
word, because the checker reads words marked as a quote as someone else's speech. The checker sees
no other message, no reply and no tool result, so outside content reaches it only as a marked span
of the user's own message.

The checker's prompt names the user the way the conversation does, so its examples read like the
memories it judges. The user writes to the assistant, so the prompt reads "you" in the message as
the assistant. A memory about the user therefore never takes a fact the message states about the
assistant, and the checker confirms a shared item only when the user's message states it.

It answers asserted, not asserted or unsure, with a reason, and only asserted lets a write apply. A
timeout, an error or an unreadable answer reads as unsure, so the checker fails closed. The verdict,
the checker's model ID, any failure, and the [snapshot hash](../core/definitions.md) of the
definitions in force when the checker ran join the version's checks. The reason is free text that
may repeat the memory, so nixie keeps it only in a proposal, sealed under the item's key, and never
in a version ([memory proposals](#memory-proposals)).

Each rendered checker prompt enters the snapshot hash as the SHA-256 of its text, so a release that
changes a prompt, or a change to the user's name, changes the hash. A
[seed](../core/definitions.md#seeding) of the definitions can put a new snapshot in force while the
checker runs. The write transaction then finds the hash changed and applies nothing, and nixie runs
the whole gate again under the new snapshot, up to 3 attempts in all, so every applied version
carries the verdict of the prompt in force at its write.

## Retirement intent

`memory.retire` takes an item, the revision the thread read and an intent quote, with no replacement
text. The intent gate runs these steps:

1. **The read check.** A [recall record](./store.md#recall), which the store appends for each item
   and version it delivers to a thread, shows that the calling thread received the item at that
   version. A target the thread never read becomes a proposal with the reason `ambiguous_target`.
2. **The quote check.** The gate searches the evidence window, as for a remember without an event
   ID, for a message that holds the intent quote in typed text
   ([the quote check](#the-quote-check)). With no intent quote, or none found, the retirement
   becomes a proposal.
3. **The checker.** The checker, under its retirement prompt, sees the user's message and the item's
   text, which it reads as untrusted data, and confirms that the user asked to retire that item or
   said the fact stopped being true.

The token check never runs on a retirement, because a retirement adds no text. The retirement
version copies the stored text with its source and evidence, and adds its own intent quote.

## Pins

`memory.pin` asks to add an item the model already has to
[the pinned core](./context.md#the-pinned-core), by the item and the revision the thread read. A pin
declares the `memory_write` effect and sets its `subject` from the item, so the user's rules decide
it as they decide any memory write ([rules on memory writes](#rules-on-memory-writes)). The core
opens every session and costs every turn that reads it, so the user decides what goes in, and a pin
becomes a proposal of its own unless a rule says otherwise. A pin runs no quote check and no
checker: it adds no text, so the gate has nothing of the user's to check. What a pin does under each
answer of the rules:

| The rules for the pin                | What the pin does                                                |
| ------------------------------------ | ---------------------------------------------------------------- |
| A deny rule matches                  | Nothing: the decision point denies the call before the tool runs |
| An ask rule matches                  | A pin proposal with the reason `ask_rule`                        |
| A covering allow rule matches        | The item joins the core at once, with a notice entry             |
| No rule matches, or no answer at all | A pin proposal with the reason `pinned`                          |

The starter rules hold no rule on `memory_write`, so a pin on a starter deployment waits for review.
A pin from a task carries the source `task` and a pin from the conversation carries none, so an
allow rule whose `sources` lists `owner` never covers a pin. A snapshot of definitions from before
`memory.pin` declared `memory_write` gives the call no answer from the rules, so such a pin stays a
proposal.

An active item past its [end time](./store.md#end-times) counts as retired, so its pin fails. A pin
of an item already in the core applies at once and writes nothing. An approval pins the item through
the store, bound to the proposal's version, so an approval fails as stale once the item moved on,
fails as retired once its end time passed, and fails with `PINNED_CORE_FULL` when the core has no
room left in its budget. A pin that a rule applies at once fails the same way, as a tool error that
writes nothing.

`memory.unpin` takes an item out of the core at once and needs no review, because the item stays in
memory and recall still finds it. It declares the `note` effect, so a rule on `memory_write` never
matches it, and a rule on its tool name still decides it through the usual path
([memory_write](../policy/approvals.md#memory_write)). It writes a [notice](#notices) entry. It adds
no version, so the store's undo never reaches it.

## Self-notes

A self-note waits for the user's review unless [an allow rule covers it](#rules-on-memory-writes).
nixie writes a self-note about itself, in its own voice, such as its tastes or how something landed
with the user. An item's subject is whose it is
([items and versions](./store.md#items-and-versions)): `owner` for a fact about the user, `shared`
for something between the user and nixie, such as a deal or a nickname, and `self` for a self-note.
`memory.remember` takes the subject, `owner` by default. An item keeps its subject until an approved
[subject change](#subject-changes) moves it, so an edit that keeps a self-note's subject is a
self-note write.

Nothing of the user's backs a self-note, so the gate skips the quote check and the checker. It runs
the hidden-character check, and a token check that compares the note's destination-like tokens with
everything the user typed in the evidence window. Without a covering rule, the write becomes a
proposal with the reason `self_note` whatever the token check found, and the proposal keeps the
token verdict, so the review shows a destination the user never typed.

The conversation writes self-notes, because it speaks as nixie's persona. A task whose definition
sets `memory: self_notes` writes them too. The run's tool endpoint carries that grant on its tool
run, and `buildWriteCaller` copies it to the write caller, so a tool's input never sets it. Every
other task's write that creates a self-note, edits one, edits its labels, or moves an item into or
out of self fails and writes nothing, unless an allow rule covers it. A covering rule is the user's
consent to nixie's own notes, so a task may then write them. Under an ask rule, or with no rule,
such a task's self-note write still fails.

The grant lifts only that caller check. A task with the grant writes a self-note under the same
gates and approvals as the conversation. Its writes that touch an item of the user or of shared
follow the rules of every other task, with or without the grant, and so do its pins and unpins. A
proposal merges only with a pending proposal of the same subject. When the user approves a proposal
for a new item, the search for a [close match](#memory-proposals) looks only at items of the
proposal's subject, so a fact about the user never becomes a revision of a self-note.

Unless an ask rule matches, the conversation's retire of a self-note skips the intent gate and
applies at once, with a notice entry whose undo brings the note back, because the note was nixie's
own and a retirement only narrows what the conversation reads. Its version records no intent quote.
A retire of a self-note by a task with the grant applies at once the same way. Any other task's
retire of a self-note runs the intent gate as any retirement does, unless an allow rule that checks
`subject` `eq` `self` covers it.

## Subject changes

`memory.edit` takes an optional subject, and a subject other than the item's own moves the item to
it, so nixie can fix an item filed under the wrong subject. A subject change changes whose fact the
item is, so it waits for the user's review unless an allow rule covers it. Without a covering rule,
the gate runs the checks of the subject the item moves to: a move into self runs the self-note
checks, and a move to `owner` or `shared` runs the content gate. The review reason depends on how
those checks ended:

| The checks of the new subject                  | Review reason                           |
| ---------------------------------------------- | --------------------------------------- |
| Every check passed                             | `subject_change`                        |
| A move into self whose token check passed      | `subject_change`                        |
| A move into self whose token check failed      | `self_note`                             |
| Any other check failed, or an ask rule matched | That check's reason, such as `no_quote` |

A covering rule applies the move at once, after the hidden-character check, as it applies any other
edit. A move into self needs a rule that checks `subject` `eq` `self`, and a move out of self needs
what the subject it moves to needs. The applied move writes the version, its subject change record
and a notice entry, and checks the pinned core budget against the new subject, as an approval does.

The proposal holds the subject its item has and the subject the item moves to, and the new subject
sits in a record of its own after the proposal record
([items and versions](./store.md#items-and-versions)). A pending edit that moves its item merges
only with an edit that makes the same move. An approval writes the new version and a subject change
record in one transaction. It checks the pinned core budget against the new subject, because the
core renders each subject under its own heading and the budget counts the headings. The store keeps
the old subject on that version, so an undo of it moves the item back.

## Writes from a photo

Memory never holds an image, and the log reader sees only a marker where the user attached one. The
conversation sees the image itself, and saves a fact it learns from the image through
`memory.remember` as it saves any other fact, with an image source: the event ID of the user's
message that holds the image and the image's number in that message. The gate refuses an image
source that does not name an image of one of the user's readable messages in the write's thread, and
writes nothing.

A photo never counts as the user's words, and neither does text the model reads inside one. The gate
therefore skips the quote check and the checker for a write from a photo, whatever quote the write
gives, and the proposal keeps no quote. It runs the hidden-character check and the token check, as
for a self-note, and the write becomes a proposal with the reason `from_photo`. The proposal's
checks name the image, and the [proposals page](./view.md#proposals) shows the photo.

An allow rule covers a write from a photo only when it also checks the `image` argument, such as
`{ arg: image.eventID, op: matches, value: '*' }` in its `checks`
([the rule format](../policy/rules.md#the-rule-format)). A rule with no such check leaves the write
a proposal, even one whose `sources` allows `outside`. A version from a photo keeps the image in its
checks. Recall returns its image source, so the conversation can open the photo with the
[log image tool](./context.md#reading-the-log), and the item's history on the
[memory page](./view.md#an-items-history) shows the photo beside the version.

### Image offer records

A deployment's log can hold image offer records, though no tool writes one. Each one seals, under
its own key, a sentence that the model offered to save from an image. A forget of the image's
message removes the key of every offer record for its images. A sentence the user saved lives on as
a version under its item's key, and that version's checks name the offer record, so at each start
the store removes the key of every offer record that a version cites. A forget of the saved item
then leaves no copy of the sentence readable. The reply that presented an offer holds its sentence
too, and only a forget of that reply removes that copy.

## Provenance

nixie sets every provenance field from the calling step, never from the tool's arguments
([items and versions](./store.md#items-and-versions)). The origin is who wrote the version: the
conversation or a task, with the task and the model ID of the call; the user, when they changed a
proposal's text on approval; or a lapse, when an [end time](./store.md#end-times) passed. The source
is whose words the text is: the user's, or outside content. A version holds the verdict of each
check that ran, so it holds a checker verdict only when the gate reached the checker.

A write that passes the content gate takes the user's words as its source. A write under an allow
rule, a self-note and a write from a photo take outside content, and so does every proposal, even
when its quote lies in the user's message, because the gate did not tie the text to the quote. The
user's approval keeps that source: it confirms that the user wants the text kept, not that the user
typed it, so the conversation reads the item as unconfirmed and approved
([how an item reads](./context.md#how-an-item-reads)). An approval with text the user changed takes
the user as its source, because the words are then the user's. One exception: such an approval of a
write from a photo keeps outside content, because the fact still comes from the photo.

## Rules on memory writes

`memory.remember`, `memory.edit`, `memory.retire` and `memory.pin` declare the `memory_write`
effect, so the user's rules decide a memory write before the gate does
([memory_write](../policy/approvals.md#memory_write)). A rule that matches by tool name and a rule
that matches by the effect cover the same writes.
[The decision point](../policy/decision-point.md#memory-writes) sets the write's sources and its
`subject`, runs the rules, and hands the tool its answer:

| The rules for the write | What the tool does                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| A deny rule matches     | Nothing: the decision point denies the call before the tool runs                              |
| An ask rule matches     | The write becomes a proposal with the review reason `ask_rule`, whose checks name the rule    |
| An allow rule matches   | The write applies at once, if a matching rule covers it and the hidden-character check passes |
| No rule matches         | The tool runs every check                                                                     |

An allow rule covers a write when it matches and holds the checks that the write needs:

| The write                                                    | What the rule needs                |
| ------------------------------------------------------------ | ---------------------------------- |
| A new fact, a text edit, a pin, a retirement or a label edit | Nothing beyond the match           |
| Any write whose subject is self, or that moves into self     | A check that `subject` `eq` `self` |
| A write from a photo                                         | A check on an `image` argument     |
| A self-note from a photo                                     | Both checks                        |
| A move out of self                                           | What the subject it moves to needs |

When several allow rules match, one covering rule is enough, and the version's checks record that
rule. A covered write applies from the conversation or from a task, takes outside content as its
source, and adds a [notice](#notices) entry. The covered kinds are a new fact, a text edit, a label
edit, a subject change, a self-note write, a pin, an unpin and a retirement. The one check that
stays under every rule is the hidden-character check: a covered text or label write that holds a
hidden character becomes a proposal with the reason `invisible_character`. A covered write skips the
quote check, the checker and the token check, because the rule is the user's consent. A pin, an
unpin and a retirement add no text, so they run no check.

The decision point gives a write the source `owner` only when it finds the quote in text the user
typed, and adds the source `task` to a write from a task run. An allow rule whose `sources` lists
only `owner` therefore covers only a conversation write whose quote the user typed.

- A self-note, a label-only edit and a write from a photo carry no quote, so the source `owner`
  never reaches them. A pin carries the source `task` from a task and no source from the
  conversation.
- Under an allow rule, nixie retires an item at once with a notice, and skips the read check, the
  intent quote check and the retirement checker.
- The starter rules, the rule set that the definitions scaffold ships, hold no rule on
  `memory_write`, so every write runs every check, and a pin and a label-only edit wait for review.

### What a rule will not cover

Before nixie writes a mandate, it reads which memory writes each of its rules will not cover. The
mandate tool's result lists them in `memoryGaps`, one entry per rule that reaches memory, with the
rule's number and a short phrase for each kind of write. The approval card shows the same phrases in
a field `rule N will not cover`, for a mandate and for a proposed rule. A kind of write is listed
when the rule does not match its best case, or when the rule matches and lacks a check that the kind
needs. The list drops a rule's expiry and every check except those on `subject` and `image`, because
a check on another argument, such as `text`, narrows a rule in a way the list cannot know. A rule
that is not an allow rule, or that reaches no memory tool, lists nothing.

## Memory proposals

A write that fails a gate becomes a memory proposal, bound to its exact operation:

| Operation          | Bound to                                                             |
| ------------------ | -------------------------------------------------------------------- |
| A remember or edit | The text, the quote, the end time, the labels and the target version |
| A retirement       | The intent quote and the target version                              |
| A pin              | The target version, with the item's text at that version as its text |

The proposal's text, quote and checker reason are sealed under the item's own key, and a proposal
for a new item creates that item's key. A forget of the item therefore makes its proposals
unreadable too. The unencrypted columns hold the review reason, the checks and the provenance, so a
count of proposals by review reason decrypts nothing.

A proposal for an item whose [evidence purge](store.md#the-evidence-purge) has not finished fails
with `ItemPurgingError` and writes nothing, and nixie tells the model to try again later. The
proposal transaction also checks that the key the proposal was sealed under is still the item's
current key, so a purge that closed between the seal and the commit refuses the proposal the same
way.

The user approves or rejects each proposal against the hash of the operation they saw, and a hash
that no longer matches refuses the answer. An approval applies the bound operation and records the
approval with the version. The user can change a remember's or an edit's text before approving it.
nixie then applies the user's text, so that version takes the user as its origin and cites no
evidence, and the user as its source unless the write came from a photo ([provenance](#provenance)).
The text of a retirement, a pin or a label-only edit never changes on approval. An approval of a
proposal whose item moved on fails as stale and applies nothing, and the proposal stays pending so
the client can offer it against the current version. A rejection's reason is free text, so it sits
in the rejection record's erasable fields under that record's key.

A proposal holds its labels sealed under the item's key, in a record of its own. A proposal that
carries labels binds to the item's revision, which counts label edits as well as text versions
([labels and the revision](./store.md#labels-and-the-revision)), so its approval fails as stale when
either moved on. A proposal with no labels binds to its text version. An approval of a label-only
proposal adds a label record and no version. A pending proposal for a new item that carries no
labels takes the labels nixie derives from its text when the user approves it.

A write that makes the same change as a pending proposal merges into it instead of adding a second
proposal. The same change matches on all of these:

- the operation, and the target version or, for a new item, the subject;
- the subject an edit moves the item to, or no move;
- the image source, or none;
- the end time;
- the labels, the label-only mark and the target revision;
- the text, once case, spacing and a closing full stop are set aside.

The check runs inside the write's transaction, so two writes of one fact never both miss it. A merge
records the second proposer against the proposal, adds nothing against the cap, and moves the
proposal's lapse to a full lapse window from the merge. When a task or the user proposes again what
the conversation's pending proposal holds, the conversation learns of the merge from an event in
[the events block](../core/conversation-turns.md#the-events-block). A reworded fact stays a proposal
of its own.

An approval of a proposal for a new item first searches the retrieval index with its text. When an
active item shares a configurable share of the proposal's content words, the approval holds and
returns that item, because applying would leave 2 active items that state one fact. The user then
answers again: as a revision of that item, or as a new item anyway.

A proposal lapses after a configurable time, or at its end time when that comes first, so an
approval never applies a fact that has already ended. A conversation turn or a task run makes at
most a configurable number of proposals, the proposal cap, and the next one fails as a tool error,
so an injected instruction cannot flood the user's review. A lapsed or rejected proposal for a new
item deletes that item's key, because the proposal held its only reference, and so does an approval
that applies it as a revision of another item.

## Notices

Each applied write, each proposal, each unpin and each at-once label edit or pin adds an entry to
its group's notice. A conversation write's group is its turn, keyed by the user's newest message in
the thread, and a task's write's group is its task run. The client shows a turn's notice at the end
of that turn, before the user's next message. It shows a task run's notice in the task's thread,
after the last record that came before the notice's newest entry. Each entry links to its item in
the memory view, or to the proposals page for a proposal.

An entry for a label edit, a pin or an unpin shows the change and links to the item. It offers no
undo, keep or retire, because the [memory page](./view.md#an-items-history) already offers an unpin
and shows the label history. nixie keeps these entries in a table of their own, so the release
before reads the table of every other entry unchanged, and a rollback by one release still starts.
Any other entry whose item still stands at the version it wrote offers undo, keep and retire, each a
[checked action](../channels/api.md#checked-actions) bound to that version, so an item that changed
after the notice refuses the change as stale. Undo writes the store's undo version, retire writes a
retirement, and keep writes no version: the API stores the keep as a checked action's result, and
reads those results back to show the entry as kept.
