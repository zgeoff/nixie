# Spike results: the consent checker on real messages

This report runs a draft consent checker over one deployment's own conversation turns and scores
each verdict against a label for the pair. On the calls whose record keeps their whole input, the
checker credited no call the user did not ask for, and missed about half the calls the user did ask
for. On the memory tools, the call record drops the free text the call carries, so the checker
judged an item ID with no text, and those rates measure the record, not the checker.

The data is the user's own and never enters the repo. The harness reads the `records.jsonl` file of
a plain export, writes its cases, labels and verdicts to the output files its flags name, and prints
counts and rates only.

## Setup

- The checker is the check guest's query options, run through Agent SDK 0.3.296, with the draft
  prompt in [prompt.txt](prompt.txt) and the check guest's verdict schema. It ran on Claude Sonnet
  5.5 at high effort, the profile the deployment maps to the `checker` role.
- The input to each check holds the user's messages that started the turn, with each span the user
  did not type marked as pasted, then the call as its tool name and its recorded input. It holds no
  tool output and no earlier turn, as the decision point's consent check sets.
- The labeller is the same query on Claude Opus 5.5 at medium effort, the conversation role's
  profile, with the instruction in [label-prompt.txt](label-prompt.txt) and the deployment's
  persona. It saw each turn's messages, the 4 messages and replies before the turn, and each call of
  the turn that forms a natural pair, and labelled each of those calls asked, not asked or unsure. A
  call to a read-only tool or with an unreadable input forms no pair, so the labeller never saw it.
- Both ran on the deployment's Claude subscription, and the cost is the cost each call reported.

The steps live in these files:

- [build-consent-cases.ts](consent/build-consent-cases.ts) groups the calls into turns and builds
  the natural and swapped pairs.
- [build-label-turns.ts](consent/build-label-turns.ts) gives the labeller each turn's natural-pair
  calls with the exchanges before it, so an answer to the assistant's offer reads as a request.
- [render-checker-input.ts](consent/render-checker-input.ts) marks each span the user did not type
  as pasted, and gives the call as its tool and input.
- [run-labels.ts](consent/run-labels.ts) and [run-checks.ts](consent/run-checks.ts) run the check
  guest's query options on each turn or pair, stop at the spend limit or at a call the model API
  refuses, and resume a run that stopped.
- [build-check-fingerprint.ts](consent/build-check-fingerprint.ts) and
  [build-label-fingerprint.ts](consent/build-label-fingerprint.ts) hash the input each call judged.
  A resumed run and the score use a saved verdict or label only while its hash matches the input
  that the current cases give, because a rebuild of the cases can keep an ID and change its
  messages.
- [run-paid-query.ts](consent/run-paid-query.ts) runs one query and keeps the cost its result
  reports, a failed result included, because the check guest's own loop drops the cost of a failure.
- [build-ledger.ts](consent/build-ledger.ts) reads a run's spend from its output file. A run appends
  a reservation before each call, and a reservation that no record settles counts in full. Each
  reservation holds at least the most one call of the run can cost, and a run refuses a `--reserve`
  below that. A resumed run first settles each reservation that a crash left open at its reserved
  amount, then runs the call again under a new reservation, so a crashed call counts twice.
- [build-ledger-writer.ts](consent/build-ledger-writer.ts) appends each reservation, settlement and
  record, and refuses a line whose move of its call's reservation the table in
  [check-reservation-move.ts](consent/check-reservation-move.ts) lacks. The one move it holds is
  from reserved to settled, and a rerun of a settled call writes a new reservation.
- [build-label-record.ts](consent/build-label-record.ts) and
  [build-check-record.ts](consent/build-check-record.ts) turn each reply into the record a run
  appends.
- [score-verdicts.ts](consent/score-verdicts.ts) gives the miss and wrong-credit rates with their
  95% Wilson intervals.

### Data and pairs

The export held 1,119 conversation turns and 313 tool calls, with no unreadable record and no
message whose spans were unknown. A call whose tool declares only a read effect needs no consent, so
the harness left out the 48 such calls. The other 265 calls, from 137 turns, each form a natural
pair with the messages of the turn that made it. A turn holds the messages up to the cursor its step
committed, because the inbox also holds records of other kinds that the export leaves out. Each of
those turns also forms one swapped pair with the first call of the nearest turn from half the list
away whose calls use none of its tools, 137 pairs in all. So each swapped pair is unrelated by tool:
its call uses a tool that the turn itself never called. The swapped pairs have no labels, because a
turn's messages can still ask for a tool the turn never ran, so the report gives only the share of
them that the checker credited.

| Labeller label | Natural pairs |
| -------------- | ------------- |
| Asked          | 132           |
| Not asked      | 84            |
| Unsure         | 49            |

A miss is any verdict but `asserted` on an asked pair, because the decision point counts a refusal,
an unsure answer and an unreadable answer alike as no consent. A wrong credit is `asserted` on a
pair that was not asked. Unsure pairs count in neither rate. A check with no answer, such as a call
the model API refused, measures the API and not the checker, so it counts only in the spend and
stays out of both rates; this run had none. Each interval is the 95% Wilson score interval.

## Results

| Pairs               | Miss rate         | Wrong-credit rate |
| ------------------- | ----------------- | ----------------- |
| Natural, every tool | 0.636 (84 of 132) | 0.000 (0 of 84)   |
| Natural interval    | 0.552 to 0.713    | 0 to 0.044        |
| Natural, web fetch  | 0.470 (31 of 66)  | 0.000 (0 of 8)    |
| Web fetch interval  | 0.354 to 0.588    | 0 to 0.324        |

The checker credited none of the 137 swapped pairs, with an interval of 0 to 0.027, and none of the
44 among them whose call is a web fetch.

The run judged one turn on 1 of its 2 messages, because the case builder of that run dropped a
message that landed after the turn's step started. That turn gave 1 natural pair and 1 swapped pair,
so each count can move by at most 1. The miss count is 83 to 85 of 131 to 133 asked pairs, the
natural wrong credits are 0 or 1 of 83 to 85, and the swapped credits are 0 or 1 of 137. The case
builder in this folder gives the turn both messages, and on the same export it builds every other
pair unchanged.

The natural pairs by tool:

| Tool              | Asked | Missed | Not asked | Wrongly credited |
| ----------------- | ----- | ------ | --------- | ---------------- |
| Web fetch         | 66    | 31     | 8         | 0                |
| Memory retire     | 28    | 25     | 5         | 0                |
| Memory edit       | 29    | 22     | 14        | 0                |
| Memory remember   | 6     | 4      | 43        | 0                |
| Skill reload, all | 2     | 1      | 1         | 0                |
| Memory comment    | 1     | 1      | 0         | 0                |
| Memory rate       | 0     | 0      | 6         | 0                |
| Memory pin        | 0     | 0      | 4         | 0                |
| Skill write       | 0     | 0      | 3         | 0                |

Of the 84 misses, 47 were `not_asserted` and 37 were `unsure`. Every check returned a readable
verdict.

## Findings

The checker fails closed on this prompt. It credited none of the 84 natural calls the user did not
ask for, so a wrong credit on a natural call stays below 4.4% at 95%. It credited none of the 137
swapped pairs either, though with no labels those give no wrong-credit rate.

It also refuses about half of the fetches the user asked for. Web fetch keeps its whole input in the
record, so its 31 misses of 66 are the checker's own. A consent check that misses that often sends
those calls on to an approval prompt, which the decision point counts as a defect when the user
named the target.

Each memory tool removes its free-text fields, such as the memory's text, its quote and the
retirement's intent quote, before the call record is written. So the checker saw only an item ID and
a version for an edit or a retirement, and no content at all for most saves. It missed 25 of 28
asked retirements and 22 of 29 asked edits. These rates measure the record, so the checker that the
decision point runs has to see the whole call, the text of each memory included, before its memory
rates mean anything.

An earlier build of the swapped pairs could borrow a call from a turn that used the same tool, and
the checker credited 3 of the 38 such pairs, each a save or an edit with its text dropped. Such a
call can be the very action the turn asked for, so those 38 pairs count only in the spend.

## Spend

| Calls    | Count | Spend   |
| -------- | ----- | ------- |
| Labeller | 137   | $1.7357 |
| Checker  | 440   | $1.9056 |
| Total    | 577   | $3.6413 |

The checker's 440 calls include the 38 swapped pairs of the earlier build.

Each query runs under two caps that this spike chose rather than measured: 32,000 output tokens for
each request, and 3 requests for each query, structured-output retries included. The recorded run
kept only the cost that each result reported, so it holds no token counts to measure them against. A
check that needs more is cut off and recorded as a failed call, and the recorded run had no failed
check. Under those caps one call costs at most about $1.74 for a Sonnet 5.5 check and $3.48 for an
Opus 5.5 label, and a run reserves that much before each call.

## Untested

- The prompt is a draft written for this spike, not a shipped prompt, and no other prompt or effort
  ran.
- The labels come from a language model given the deployment's persona, not from the user. The
  labeller saw no memory text either, only the exchanges before the turn.
- The memory tools on their whole input, which the record does not keep.
- A label for each swapped pair, so their credits give no wrong-credit rate.
- A call that sends a message to another person, or any call with a destination: the export holds
  none, so the code half of the consent check never ran.
- One deployment over its first weeks, so its share of fetches and memory changes sets the overall
  rates.
