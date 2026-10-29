# The memory view

The memory view lets the user see, search, review and change every memory item. It reads items a
page at a time by state, searches the active ones, shows the pinned core against its budget, and
opens one item's history with the provenance of every version. Its reads deliver nothing to a task,
so none of them takes the delivery lock or writes a recall record, as no read by the host commands
does. Each change it makes is the user's own action on the store, bound to the version the user saw.

[The memory store](./store.md) covers the items, versions, states and indexes the view reads, and
[memory writes](./writes.md) covers the checks whose verdicts each version keeps.

## Lists

The view lists the items of one state a page at a time, newest first, so an item the user approved a
moment ago heads the first page. A page's cursor holds the creation point of its last item, and the
next page starts at the item created just before it. A list may ask for facts or for self-notes
alone, so each pages through its own items. Active and retired items list apart. The forgotten list
holds each item a forget began, so an item whose forget a crash cut short still shows. Each listed
item carries its current version's text while its key exists, the origin and source of that version,
and when the item was created and last changed. A forgotten item carries no text and the time its
forget completed, so it shows as a dated gap.

## Search

A search ranks the active items through both recall indexes, as a recall's query does, and returns
each match with its keyword score and its similarity, each where that index placed it, and the
search mode. The indexes rank item IDs and never supply text, so the view reads each match from the
log as a list does. An item that left the active state between the ranking and the read is left out.

## The pinned core

The view reads the pinned core in the order the user pinned its items, with its size counted as a
pin counts it: each item as a session's opening renders it, with the owner's name and the widest
date ([the pinned core](./context.md#the-pinned-core)). The budget beside the size is the one a pin
must fit. A pinned item whose text fails to open still shows, so the user can unpin it, and it adds
nothing to the size, because a session's opening leaves it out.

## An item's history

An item's history holds every version, oldest first, each with its provenance: its change and state,
its origin and source, the task and proposal behind it, the verdict of each write check, the model
of the call that wrote it and the model of the checker that judged its quote. A version the memory
writer applied whose row holds no model takes the model from the record of the batch that applied
it. The source labels the version's text, so an approved proposal reads as outside content beside a
quote from the user's message ([provenance](./writes.md#provenance)). A version with evidence
carries the quote's offsets and the text of the message the offsets point into, so the view shows
the quote inside its message. The view reads that message only while the version's own text is
readable. A forgotten item therefore never shows the words it came from, even while the user's
message still holds them. A message forgotten on its own reads as a gap beside a readable version.

A version [from a photo](./writes.md#writes-from-a-photo) carries the photo's event ID, its number
and the thread of the proposal the user approved, and the web view shows the photo beside the
version as the proposals page does.

## The web view

The web client shows the memory view as its own page, behind the same session check as the
conversation. The page opens with the memory writer's progress: whether its catch-up over the
conversation from before memory still runs, the record its cursor stands at, how many of the user's
messages wait, and its last error. A writer that the deployment turns off shows as off, and so does
a consolidator that the deployment turns off. The pinned core with its size follows, then the active
items or the matches of a search, then the retired and the forgotten items, each list apart. Every
list draws an item through one row, so a control on an item shows in every list. The active items
and the matches show self-notes in a section of their own, apart from the user's and the shared
items, and a self-note's row in any other list carries a self-note label. A row offers a pin
whatever the item's subject. A row shows whether its item is [sensitive](./store.md#sensitive-items)
and offers to mark it or clear the mark.

An item's history loads only when the user opens it, so a long list reads no history it never shows.
Each version shows the words it changed from the version before as a word diff, and its evidence as
the message with the quote marked inside it. A version whose message is gone shows the quote alone,
with the reason the message is missing.

## Changes

A retire, a restore, a pin and an unpin from the view each go through the store with the user as
origin and source, as the host commands' changes do. Each binds to the version the view showed: the
retire and the restore through their target, and the pin through the version it names, so an item
that moved on since the user looked fails the change as stale and changes nothing. A sensitive mark
goes through the store the same way and binds to no version, because it changes no text.

Each change from a device is a checked action
([checked actions](../channels/api.md#checked-actions)). The store runs a caller's own write inside
the change's transaction, before the change, and the API puts there its check that the caller's
session is still live and the action's result. The change and its result therefore commit together
or not at all. A retry with the same client action ID finds that result and makes no second change,
even though the item has moved past the version the retry names. The memory store starts after the
API listens, so every procedure of the view refuses a call until the store starts.

A memory notice's undo and keep run through the same path, bound to the version the notice wrote
([notices](./writes.md#notices)). A notice's link opens the memory page with that item shown at the
top, above the lists.

The web page asks before each change, and the confirmation keeps the version and the client action
ID it opened with. A list that refreshes under an open confirmation therefore never moves the change
onto a version the user did not see, and a confirm that fails in transit and goes again changes the
item once. Every refusal or change reads the lists again, so the row shows the item as it now
stands. That read can move the item to another list, so the reason for a refusal, such as a stale
version or a full pinned core, shows at the top of the page and not in the item's row.

## Forgetting an item

The view forgets an active or retired item in two steps, a preview and then the forget, and both
bind to the version the row showed. The preview reads the item with every version, and counts the
messages that backed any version or proposal and the proposals for the item. It refuses as the
forget refuses, so no confirmation opens for an item that is gone, moved on or being forgotten. The
forget runs the store's forget ([forgetting](./store.md#forgetting)) with the user as origin, so an
item that changed after the preview refuses it as stale and nothing is destroyed.

The forget is a checked action like the other changes, and its result commits in the transaction
that marks the item forgetting. A retry with the same client action ID therefore finds the result
and runs the forget's cleanup again, so a forget whose session cleanup failed after its start
completes on the retry instead of waiting for the store's next start. That rerun touches only an
item that is still forgetting, so it never deletes the key of an item no forget began.

The web page's confirmation shows the history from the preview, what the forget destroys, and what
it cannot reach. A disk snapshot that the user took by hand of nixie's host or its volumes still
holds the item, because no forget reaches a copy that nixie never made. The user's messages and
nixie's replies that state the same fact stay under their own record keys, so the confirmation links
to the conversation, where each one has its own forget
([forgetting a message](../channels/api.md#forgetting-a-message)). Once the forget applies, the item
shows in the forgotten list as a dated gap. The `memory-forget` host command runs the same store
forget, bound to the version that `memory-show` printed.

A forget whose start committed and whose cleanup failed lists as forgetting, and any refresh of the
lists, such as a pin of another item, moves it out of the row that held its confirmation. The page
therefore keeps each forget call in the query client, apart from every row, and the forgetting
item's row in the forgotten list offers to finish the forget while its last call failed. That retry
sends the same client action ID, so the server runs the cleanup again.

## Deleting retired items

The retired list offers one checked action that forgets selected retired items, or all of them, in a
[bulk forget](./store.md#forgetting-retired-items-in-bulk). Its preview lists the oldest retired
items up to a cap, each at its version with what its forget destroys, and says when more remain. The
confirmation starts with every listed item selected, states that the deletion cannot be undone and
that chat records stay, and sends the selected items with the versions the preview showed.

The page keeps the set it first showed while the confirmation is open, so a refresh of the lists
never changes what the user confirmed. A stale set closes the confirmation with the reason, and
nothing is deleted. A run whose cleanup failed keeps the confirmation open with a count of deleted
and pending items, which the status read returns, and offers to finish the run. That retry sends the
same client action ID, so the server runs the cleanup of each pending item again. The page keeps
each bulk call in the query client, as it keeps each single forget, so the retired list still offers
to finish a failed run after the user leaves the page and comes back.

## Proposals

The view lists every pending proposal on a page of its own, which the memory page links to. Each
proposal shows its text, the check that sent it to review, who proposed it and from what source, its
quote inside the message it came from, the date its fact ends when it sets an end time, whether it
marks its item sensitive, and when it lapses. The quote and its message open under the item's key,
as the proposal's text does, so a forgotten item's proposal drops out of the list whole
([memory proposals](./writes.md#memory-proposals)).

A proposal [from a photo](./writes.md#writes-from-a-photo) shows the photo beside its text. The page
reads the photo as the conversation page reads a message's images, so a forget of the photo's
message leaves a gap marked as unavailable where the photo was, and the proposal stays for the user
to answer.

The user approves a proposal, edits it and approves the edit, or rejects it with an optional reason,
one at a time or for every selected proposal in one call. Each answer in a call is its own checked
action with its own client action ID, and the store writes its own approval or rejection record, so
a call that answers several proposals leaves the same records as the same answers sent one by one.
The answers run in order, and one that fails leaves the rest to go on. An answer binds to the
proposal's action hash, and its input hash covers whether the user edited the text or gave a reason,
never the text or the reason, because a hash of free text would confirm a guess at words a forget
later shreds.

An answer that meets a proposal that lapsed, was answered, changed or is gone, or an item that moved
past the version the proposal binds to, comes back stale and writes nothing: the store refuses it
before the action's own write runs, so no record and no client action result commit. A committed
answer closes its proposal, so the API looks up the client action ID before it answers, and a retry
gets its first outcome back instead of a stale one. An edited approval meets the close match check
on the edited text, and a held approval comes back with the item that matched, which the user then
revises or leaves for a new item.
