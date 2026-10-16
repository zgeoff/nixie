# The memory view

The memory view lets the user see, search, review and change every memory item. It reads items a
page at a time by state, searches the active ones, shows the pinned core against its budget, and
opens one item's history with the provenance of every version. Its reads deliver nothing to a task,
so none of them takes the delivery lock or writes a recall record, as no read by the host commands
does. Each change it makes is the user's own action on the store, bound to the version the user saw.

[The memory store](./store.md) covers the items, versions, states and indexes the view reads, and
[memory writes](./writes.md) covers the checks whose verdicts each version keeps.

## Lists

The view lists the items of one state a page at a time, in the order they were created, with the
same cursor a recall's listing uses. Active and retired items list apart. The forgotten list holds
each item a forget began, so an item whose forget a crash cut short still shows. Each listed item
carries its current version's text while its key exists, the origin and source of that version, and
when the item was created and last changed. A forgotten item carries no text and the time its forget
completed, so it shows as a dated gap.

## Search

A search ranks the active items through both recall indexes, as a recall's query does, and returns
each match with its keyword score and its similarity, each where that index placed it, and the
search mode. The indexes rank item IDs and never supply text, so the view reads each match from the
log as a list does. An item that left the active state between the ranking and the read is left out.

## The pinned core

The view reads the pinned core in the order the user pinned its items, with its size counted as a
pin counts it: each item as a session's opening renders it, with the owner's name and the widest
date ([the pinned core](./context.md#the-pinned-core)). The budget beside the size is the one a pin
must fit.

## An item's history

An item's history holds every version, oldest first, each with its provenance: its change and state,
its origin and source, the task and proposal behind it, the verdict of each write check, the model
of the call that wrote it and the model of the checker that judged its quote. A version with
evidence carries the quote's offsets and the text of the message the offsets point into, so the view
shows the quote inside its message. The view reads that message only while the version's own text is
readable. A forgotten item therefore never shows the words it came from, even while the user's
message still holds them. A message forgotten on its own reads as a gap beside a readable version.

## Changes

A retire, a restore, a pin and an unpin from the view each go through the store with the user as
origin and source, as the host commands' changes do. Each binds to the version the view showed: the
retire and the restore through their target, and the pin through the version it names, so an item
that moved on since the user looked fails the change as stale and changes nothing. A caller can add
its own write to the change's transaction, which runs before the change and rolls back with it, so a
client action's result commits with the record that the action wrote, or not at all.
