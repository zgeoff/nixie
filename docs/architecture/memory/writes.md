# Memory writes

A model write to memory applies at once only when the user's own typed words back it. Every other
write waits for the user's review as a memory proposal. `memory.remember` and `memory.edit` pass a
content gate, and `memory.retire` passes an intent gate. Each gate runs code checks on a quote from
a message the user typed, then asks a separate checker model whether the message asserts the memory.
The first check that fails ends the gate, and the write becomes a proposal with that check as its
review reason. A write that fails a check therefore waits for the user instead of failing, and
nothing the model writes reaches memory on the model's word alone.

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
   the write. A write with no quote becomes a proposal.
   [Reading the log](./context.md#reading-the-log) covers a write that cites an older message.
2. **The quote check.** The quote lies wholly in text the user typed, outside any quoted block.
3. **The token check.** Every destination-like token in the memory text appears in the quote.
4. **The checker.** The checker model confirms that the message asserts the memory.
5. **Apply.** nixie writes the version, its record and the turn's notice entry in one transaction.

A write from a memory writer batch skips the first step: the one message it cites is its evidence,
and [the memory writer](./writer.md#publishing) covers how its batch publishes it.

A write that pins its item waits for review even when every check passes, because a pinned item
rides in the system prompt of every turn. A memory text that holds a Unicode format character, such
as a zero-width space or a bidirectional control, fails before any check runs.

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
normal form. A lookalike letter from another script fails every comparison. The token check stops
the most harmful poisoned memory, one that points nixie at an attacker's destination, whatever the
checker answers.

### The checker

The checker is one model call with no tools, in its own long-lived sandbox on the conversation
image, on the checker role's [model profile](../core/model-profiles.md). Its input is the user's one
message, with the quote marked as evidence and every pasted span marked, then the memory text. The
evidence mark avoids a quotation word, because the checker read words marked as a quote as someone
else's speech. The checker sees no other message, no reply and no tool result, so outside content
reaches it only as a marked span of the user's own message. The checker's prompt names the user the
way the writer does, so its examples read like the memories it judges.

It answers asserted, not asserted or unsure, with a reason, and only asserted lets a write apply. A
timeout, an error or an unreadable answer reads as unsure, so the checker fails closed. The answer's
verdict, the checker's model ID and any failure join the version's checks. The reason is free text
that may repeat the memory, so it reaches only the sealed proposal.

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

## Image offers

Memory never holds an image or a description of one: the writer and the log reader see only a marker
where the user attached an image. An image the user shows the assistant would therefore leave memory
once the conversation moved on, so the assistant offers to keep it in words the user confirms. The
assistant calls `memory.offer_image` with one image of one of the user's messages and the plain
factual sentence it would save, and the tool returns one line for the assistant to say: "Want me to
remember this? Here's what I'd save: …". nixie seals that sentence in the offer record under the
record's own key, and nothing reaches memory or the proposal list until the user answers.

An image takes one offer. The check for an earlier offer and the offer record commit in one
transaction, so 2 offers for one image never both pass, and a second offer is refused even after a
no or a silence, so the assistant never asks again.

`memory.answer_offer` passes on the user's first message after the offer, and only that message
answers it, so a later yes about something else never saves the offered sentence. The sentence saves
only when that whole message is a plain yes that the user typed, such as "yes" or "yes please",
under the quote rules. A yes with anything more, such as a correction, saves nothing, because the
version would then hold something other than what the user agreed to. Every other answer, a no
included, writes nothing at all: no version, no proposal and no notice. The same holds once a forget
of the image's message or the answer has started, because the version's transaction checks for it,
so a forget that lands while the answer saves still wins.

A saved offer skips the token check and the checker, because the user read the whole sentence before
typing the yes. The model never passes the sentence at answer time: it comes from the offer record,
so the version holds exactly what the offer line showed. The version's quote is the user's yes
followed by the sentence it confirmed, and its checks name the offer record, so the sentence never
reads as words the user typed. Its source is the user, and the check that runs inside the version's
transaction saves one offer once. Once the version commits, nixie removes the offer record's key,
and the offer tool's result record leaves the sentence out, so the sentence lives on only under its
item's key and a forget of the item leaves no readable copy in the log.

## Provenance

nixie sets every provenance field from the calling step, never from the tool's arguments: the origin
from the run's thread, the task, and the model ID of the call that asked. A version whose checks all
passed takes the user's words as its source and holds each check's verdict. Any other write has no
version until the user approves it.

The user's allow rule on a content-gate tool lets a write through that tool skip the quote and the
checker. The gate looks up the rule by the tool the write came through, `memory.edit` for a write
that names an item and `memory.remember` for a new item, so a rule on one tool never covers the
other. The rule never skips the token check, which then compares against everything the user typed
in the window. No quote of the user's backs such a write, so its source is outside content. The
policy engine has no user rules, so the gate finds no allow rule and every write runs the full gate.

## Memory proposals

A write that fails a gate becomes a memory proposal, bound to its exact operation: the text, the
quote and the target version for a remember, or the intent quote and the target version for a
retirement. The proposal's text, quote and checker reason are sealed under the item's own key, and a
proposal for a new item creates that item's key. A forget of the item therefore makes its proposals
unreadable too. The plain columns hold the review reason, the checks and the provenance, so a count
of proposals by review reason decrypts nothing.

The user approves, edits or rejects each proposal against the hash of the operation they saw, and a
hash that no longer matches refuses the answer. An approval applies the bound operation and records
the approval with the version. An edit approves the user's own text instead, so that version takes
the user as its origin and source and cites no evidence. A retirement takes no edit. An approval of
a proposal whose item moved on fails as stale and applies nothing, and the proposal stays pending so
the client can offer it against the current version. A rejection takes the user's reason when they
give one. The reason is free text, so it sits in the rejection record's erasable fields under that
record's own key, and a rejected new item keeps its reason after the rejection deletes the item's
key.

A write that proposes the same change as a pending proposal merges into it instead of adding a
second proposal. The same change means the same operation on the same target, or on a new item for
both, with the same pin and the same text once case, spacing and a closing full stop are set aside.
The check runs inside the write's transaction, so two writes of one fact never both miss it. Each
proposal's text is sealed under its own item's key, so the check opens the text of each pending
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

A proposal lapses after a configurable time, and a server sweep lapses each overdue proposal. A
conversation turn, a task run or a writer batch makes at most a configurable number of proposals,
and the next one refuses, so an injected instruction cannot flood the user's review. A lapsed or
rejected proposal for a new item deletes that item's key, because the proposal held its only
reference, and so does an approval that applies it as a revision of another item. The key goes after
the close commits, so store start and each lapse sweep delete any key that a crash or a failed
deletion left behind.

## Notices

Each applied write and each proposal adds an entry to its group's notice: one conversation turn,
keyed by the user's newest message in the thread, or one task run. The client reads a thread's
notices and groups each one's entries under the reply, and each entry binds to the version it wrote,
so the store's undo for that version applies to it.
