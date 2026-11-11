# Kept moments replayed as behaviour checks

This doc covers a way to test a changed model against your kept [moments](moments.md). A kept moment
carries a mark that makes it a check. After a model profile changes, nixie replays one turn of each
marked moment on the changed profile, with every tool stubbed, and reports where the model acts
differently. None of this is built. Its records are not designed, and neither is who marks a moment
or what starts a replay. This doc holds the requirements that a design must meet, and what limits a
replay.

Terms are in the [glossary](../../glossary.md): moment, model profile, model role, event log,
record, definitions, untrusted. This doc adds 5:

- **A check** is a kept moment that carries a mark for replay.
- **The deciding turn** is the one turn inside the moment's span whose outcome the check is about. A
  turn makes several model calls, and the mark points at one of them.
- **A replay** is one model turn that nixie runs on a named profile, from a supplied input, with a
  stub's answer for every tool call. Whether a replay stops at the model's first action is not
  written. (open: replay extent)
- **A span** is the range of records that a moment refers to: [moments](moments.md).
- **The turn-input log** is a planned log of what nixie sends to a model. It is a design of its own,
  and that design is not settled. (open: turn-input log choices)
- **A logged request** is one request to a model, as the turn-input log stores it.

The other moments designs have a file of TypeScript types in `sketches/moments/`. This doc has none,
because no record of a check is agreed. Each point that is not settled is marked here as
`(open: <name>)`, and [the open list](open/moments.md) holds it under that name, with its options
and its tracker issue. Slice 8 of [the slices](slices/moments.md), the list of work for the moments
designs, is the step in which you make those choices.

"Built" describes the code as it stands. The sections after it describe what limits a replay, what a
design must meet, and what is left to design.

## Built

- The event log holds what a turn wrote: your messages, the replies, the tool calls and the tool
  results. nixie reads each record's text until a forget deletes the record's key.
- A turn's end record holds the model, the profile, the call count and references to the memory
  used.
- The record that opens a session holds a hash of the persona and a hash of the policy.
- A read of the definitions returns the persona, the rules and the tool definitions as they stand at
  the read, and not as they stood at a past turn.
- The [memory writer eval](../../architecture/memory/writer-eval.md) calls a real model by hand,
  outside CI, because CI holds no model credential.

A turn's records hold what the turn wrote. They hold nothing of what the model received: the system
prompt, the messages as sent and the tool list. The turn-input log is the only planned source of
that input.

## What limits a replay

The intended form of the turn-input log sets these limits:

- nixie encrypts one logged request per model call, as a request body in the format of the model API
  that the call used.
- nixie destroys a logged request when a forget covers its thread, and when the request is 7 days
  old. nixie also destroys logged requests when the log passes its size bound.
- The log captures nothing until you turn it on. It then captures for at most 24 hours.
- The log captures the calls of the model roles `conversation` and `task`, and only on a profile
  whose calls go through nixie's counting proxy.
- A restore from a backup never brings back a logged request.
- Only you open a logged request, through a host command, and nixie records each opening.

Under that form, these follow:

- A moment gets its mark after the turn, and that can be more than 7 days after it. By that time
  nixie has destroyed the logged request, or the log never captured it. A design that replays only
  from a logged request therefore refuses a moment in each of those cases.
- A replay that you start by a host command fits "only you open a logged request". A replay that you
  start in the client, or that nixie starts, fits only when the turn-input log's design makes nixie
  a reader.
- A logged request has the format of one model API. A replay on a profile of another model API
  cannot send that request body unchanged.

## What a design must meet

The memory module owns the mark, because the mark is a change to a moment. A replay calls a model
through the interface of the model harnesses. [The turn-input log](turn-input-log.md) owns that
interface, and the 2 calls that a replay needs from it are additions to it. A replay has no model
interface of its own.

A model's words differ on every call. A design therefore compares actions and not words, and it
states what counts as a different action. (open: different action rule) A design meets these 3
requirements:

1. A mark points at one deciding turn inside the moment's span, and at one model call within that
   turn. When you change an edge of the span and the turn is inside the span after the change, the
   mark remains. When the change puts the turn outside the span, a design does one of 2 things:
   nixie refuses the change, or nixie drops the mark and tells you. A design picks one of the 2.
   (open: mark outside span)
2. When nixie replays the same input on the recorded profile, the report shows the same action.
   Whenever the replayed action differs from the recorded one, the report shows the difference:
   another tool, another destination of a send, or a reply in place of a tool call.
3. The report holds the recorded action and the replayed action, with the IDs of the moment and of
   the turn. It holds text of the moment only in a record's erasable fields, the fields whose key a
   forget deletes.

A replay needs this from the interface of the model harnesses:

- One model turn on a named profile, from a supplied input, with a stub's answer for every tool
  call. The turn belongs to no thread. nixie never resumes a session from it. nixie never writes a
  record of it that the build of a session's opening reads.
- A read of one logged request by nixie itself, found by the turn's record and the number of the
  call. Only a design that replays from a logged request needs this read, and it needs the
  turn-input log's design to allow it.

The rules of a replay:

- A replay runs no tool at all: a stub answers each tool call. That covers every tool with an effect
  outside nixie and every memory tool.
- A span is untrusted content, so nixie treats a replay's output as untrusted too.
- A replay sends the span's text to the provider of the profile that it uses. That provider can be
  one that never saw the conversation. (open: replay provider consent)
- When you destroy a moment, nixie destroys every replay result of that moment.
- A test of the replay never sends a turn to a production deployment and never reads from one.
- Every test case is an invented moment, committed with the test. (open: replay real cases)

## Not designed

Each of these waits for a choice in the open list:

- Who marks a moment as a check. (open: check marker)
- What starts a replay. (open: replay start)
- Where a replay's input comes from. (open: replay input)
- Where a replay's result lives. (open: replay result place)
- What a release without this design does with the record of a mark, the record of a replay result
  and a replay host command, when a deployment rolls back to that release. (open: parked rollback)

## Not in scope

- Checks on a schedule.
- A judgment of which behaviour is better.
