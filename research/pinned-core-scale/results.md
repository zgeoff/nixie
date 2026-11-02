# Spike results: the pinned core at scale

This spike checks whether the model follows the pinned-core change note when the core is full, and
in a session that runs for days. The
[earlier pinned core spike](https://github.com/zgeoff/nixie/tree/005ac542618725215789f21ef6662e08551ca064/docs/design/platform/spikes/sdk-pinned-core)
tested the note with one item in a short session.
[Memory in context](../../docs/architecture/memory/context.md#the-pinned-core) describes the change
note this spike tests. With 41 pinned items at 1,970 of the 2,000-token budget, the conversation's
model followed the note in all 5 trials, on the turn that carried it and on the turns after it. In
one session open for 10 days, it followed all 4 notes on every later turn, and followed the first
note 10 days and 23 turns after it, so the run gives no reason to send the core again in a long
session.

## Questions

1. Does the model follow a change note when the pinned core is full? The answer shows whether the
   change note design holds at the core's budget.
2. Does it still follow one in a session that runs for days? The answer shows whether a long session
   needs the core sent again in place of a change note.

## Versions

| Component        | Version                                                         |
| ---------------- | --------------------------------------------------------------- |
| Claude Agent SDK | 0.3.296, the catalog version when the runs ran                  |
| Claude Code      | 2.1.296, bundled with the SDK                                   |
| Bun              | 1.4.3                                                           |
| Model            | `claude-opus-5-5` at medium effort, the conversation's profile  |
| nixie            | `ee03aa9` for the full-core run, `23aed26` for the long session |

## Setup

Each turn runs through the conversation guest's own turn code, with the options it builds in
production. The runs use the profile that the reference deployment configuration gives the
conversation, with one change: the CLI holds a placeholder Claude subscription token in place of the
profile's API key, and the host's egress sends every call on the subscription. The runs spent no API
money, and each cost below is at Anthropic's list prices, which a subscription makes notional.

[`spike-fixtures.ts`](spike-fixtures.ts) holds the invented input: a persona for an owner called
Rowan, 44 candidate pinned items with the words Rowan said, and the edits the runs make.
[`spike-core.ts`](spike-core.ts) pins the candidates in order until the next one would take the core
past the budget, counted with the memory store's own count, as the store refuses a pin past it. The
core holds 41 items: 35 about Rowan, 3 shared and 3 self-notes. The first turn of a session opens
with the pinned memory and the status, and a turn after a core change carries the change note. The
opening, the status, the note and each message's stamp render through the production renderers.

The guest connects to an empty tool server, which
[`start-empty-tool-server.ts`](start-empty-tool-server.ts) starts, because the guest refuses a turn
whose tool server does not connect. The model has no tools, so every answer comes from the session
alone. [`build-grade.ts`](build-grade.ts) marks a reply that holds every current value and a reply
that names an old one. A reply can name an old value while it follows the change, so the results
count such a reply only after a reading by hand.

### The full-core run

[`full-core.ts`](full-core.ts) runs 5 trials. Each trial opens a new session and runs 4 turns:

1. The opening, with the full core, asks for the sister's city and the vet, so the session's history
   holds the old city in the model's own answer.
2. The core changes: the sister's item, the 9th of 35 about Rowan, gets a new city, a penicillin
   allergy is pinned, and an item about the train home is unpinned. The turn carries the change note
   and asks for the sister's city.
3. With no note, the turn asks for the allergy and the sister's city.
4. With no note, the turn asks for 2 unchanged items, the guest wifi password and the dentist.

### The long session

[`long-session.ts`](long-session.ts) keeps one session open and runs a turn every 3 hours, 26 turns
over 75 hours. The core changes 4 times, and each note rides only the turn after its change. Later
turns ask about each changed item with no note, up to 69 hours after its note. Before the last
change, the model names the old vet on 4 turns, so the last change edits a value that the model's
own answers repeat. The script writes its run file after every turn, records each pause in which the
host slept, and a second start continues the same session.

## Results

### A full core

The model followed the change note in every trial. The run file is
[`runs/full-core.json`](runs/full-core.json).

| Turn                          | Asked for                  | Answered with the current values |
| ----------------------------- | -------------------------- | -------------------------------- |
| 1, opening with the full core | sister's city, vet         | 5 of 5                           |
| 2, with the change note       | sister's new city          | 5 of 5                           |
| 3, no note                    | new allergy, sister's city | 5 of 5                           |
| 4, no note                    | 2 unchanged items          | 5 of 5                           |

On the note's turn, 4 of 5 replies named the old city, each to correct the model's own earlier
answer, as in "Rotterdam. My memory now says Edda has moved there, so I was wrong to say Ghent a
moment ago." No reply gave the old city as the answer. On turn 3, 2 replies asked Rowan to add any
allergy that memory does not hold.

On the note's turn, the note and the model's longer reply added 503 to 821 tokens of cache writes.
The 20 turns needed no retry and came to $0.19 at list prices.

### A session that runs for days

The model followed every change note on every later turn of the session. The run file is
[`runs/long-session.json`](runs/long-session.json).

The host slept 5 times during the run, and the script recorded each gap. 4 lasted 3 to 10 minutes
and fell inside the 3 hours between turns. The fifth lasted 9.5 days, from 24 October 03:45 UTC to 2
November 16:15 UTC. The script then ran each overdue turn at once, so the session's 26 turns fell in
2 runs:

| Turns    | When                           | Spacing   | Changes               |
| -------- | ------------------------------ | --------- | --------------------- |
| 0 to 9   | 22 October 23:33 to 24 October | 3 hours   | sister's city         |
| 10 to 25 | 2 November 16:15 to 16:17 UTC  | 2 to 17 s | wifi, allergy and vet |

Each message carries its time in its stamp, so the model saw the 9.5-day jump. The table lists each
graded turn after a change:

| Change        | Asked again with no note | Longest gap after its note | Answered with the current value |
| ------------- | ------------------------ | -------------------------- | ------------------------------- |
| sister's city | 4 turns: 8, 16, 23, 25   | 10 days, 23 turns          | 5 of 5                          |
| wifi          | 3 turns: 16, 21, 25      | 13 turns, 62 s             | 4 of 4                          |
| allergy       | 2 turns: 20, 25          | 7 turns, 32 s              | 3 of 3                          |
| vet           | 1 turn: 25               | 1 turn, 4 s                | 2 of 2                          |

Each count in the last column includes the note's own turn. The model named the old vet on 4 turns
before the vet changed, and on the note's turn it gave the new vet and told Rowan to correct the 2
forms where it had put the old one. On turn 23 it answered "about 40 minutes from Utrecht Centraal
to Rotterdam Centraal" and added "Much easier than Ghent was!", a reply that names the old city
beside the new one.

The context grew from 4,512 tokens on the first turn to 11,044 on the last. The 26 turns needed no
retry and came to $0.44 at list prices, so the spike's 2 runs came to $0.63.

## Untested

- Days between a later note and the turns after it. The 9.5-day sleep put the wifi, allergy and vet
  notes and every turn after them within 2 minutes, so only the sister's note was followed days
  after it came.
- The production tool list. With memory tools, the model could recall an item to check a note.
- A session that compacts after a core change.
- A core change while a turn is in flight.
