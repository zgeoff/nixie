# 0045: nixie compacts the conversation's session itself

- Date: 2026-10-14
- Status: decided

## Decision

nixie compacts the conversation's session itself, and the SDK's auto-compaction is off. When a
session grows past a threshold, nixie asks the model to write a summary of it against fixed
criteria, stores the summary in the event log, and opens a new session from that summary. The event
log then holds everything a new session opens with, and a forget can erase all of it.

## Why

- A summary in the event log is under nixie's control: the forget path reaches it, the live view
  shows it, and a rebuild reads it. A summary that lives only in the SDK transcript is lost with the
  transcript and can outlive a forget in a copy nixie cannot see.
- The model writes the summary against nixie's criteria, so the events and open threads it carries
  are the ones the next session needs, not what a generic summary keeps.
- With auto-compaction on as a fallback, a broken compactor would go unseen while the SDK hid it. A
  loud failure and a hard stop at the window make the fault visible.

## Rejected alternatives

| Option                          | Why not                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| the SDK's auto-compaction alone | It needs no step of nixie's, and its summary stays in a transcript that nixie cannot read, store or erase. |
| auto-compaction as a fallback   | It saves a turn that overflows, and it hides a broken compactor.                                           |
