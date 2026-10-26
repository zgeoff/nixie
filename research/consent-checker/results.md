# Spike results: the consent checker on real messages

This report runs a draft consent checker over one deployment's own conversation turns and scores
each verdict against a label for the pair. On the calls whose record keeps their whole input, the
checker credited no call the user did not ask for, and missed about half the calls the user did ask
for. On the memory tools, the call record drops the free text the call carries, so the checker
judged an item ID with no text, and those rates measure the record, not the checker.

The data is the user's own and never enters the repo. The harness reads a plain export from a folder
given on the command line, writes its cases, labels and verdicts beside it, and prints counts and
rates only.

## Setup

- The checker is the check guest's own query, run through Agent SDK 0.3.296, with the draft prompt
  in [prompt.txt](prompt.txt) and the check guest's verdict schema. It ran on Claude Sonnet 5.5 at
  high effort, the profile the deployment maps to the `checker` role.
- The input to each check holds the user's messages that started the turn, with each span the user
  did not type marked as pasted, then the call as its tool name and its recorded input. It holds no
  tool output and no earlier turn, as the decision point's consent check sets.
- The labeller is the same query on Claude Opus 5.5 at medium effort, the conversation role's
  profile, with the instruction in [label-prompt.txt](label-prompt.txt) and the deployment's
  persona. It saw each turn's messages, the 4 messages and replies before the turn, and every call
  of the turn, and labelled each call asked, not asked or unsure.
- Both ran on the deployment's Claude subscription, and the cost is the cost each call reported.

The steps live in these files:

- [build-consent-cases.ts](consent/build-consent-cases.ts) groups the calls into turns and builds
  the natural and swapped pairs.
- [build-label-turns.ts](consent/build-label-turns.ts) gives the labeller each turn's calls with the
  exchanges before it, so an answer to the assistant's offer reads as a request.
- [render-checker-input.ts](consent/render-checker-input.ts) marks each span the user did not type
  as pasted, and gives the call as its tool and input.
- [run-labels.ts](consent/run-labels.ts) and [run-checks.ts](consent/run-checks.ts) run the check
  guest's own query on each turn or pair, stop at the spend limit or at a call the model API
  refuses, and resume a run that stopped.
- [score-verdicts.ts](consent/score-verdicts.ts) gives the miss and wrong-credit rates with their
  95% Wilson intervals.

### Data and pairs

The export held 1,119 conversation turns and 313 tool calls, with no unreadable record and no
message whose spans were unknown. A call whose tool declares only a read effect needs no consent, so
the harness left out the 48 such calls. The other 265 calls, from 137 turns, each form a natural
pair with the messages of the turn that made it. Each of those turns also forms one swapped pair
with the first call of the turn half the list away, 137 pairs in all, which are not asked by
construction.

| Labeller label | Natural pairs |
| -------------- | ------------- |
| Asked          | 132           |
| Not asked      | 84            |
| Unsure         | 49            |

A miss is any verdict but `asserted` on an asked pair, because the decision point counts a refusal,
an unsure answer and a failed check alike as no consent. A wrong credit is `asserted` on a pair that
was not asked. Unsure pairs count in neither rate. Each interval is the 95% Wilson score interval.

## Results

| Pairs               | Miss rate         | Wrong-credit rate |
| ------------------- | ----------------- | ----------------- |
| Natural, every tool | 0.636 (84 of 132) | 0.000 (0 of 84)   |
| Natural interval    | 0.552 to 0.713    | 0 to 0.044        |
| Swapped, every tool | none              | 0.022 (3 of 137)  |
| Swapped interval    | none              | 0.007 to 0.062    |
| Natural, web fetch  | 0.470 (31 of 66)  | 0.000 (0 of 8)    |
| Web fetch interval  | 0.354 to 0.588    | 0 to 0.324        |
| Swapped, web fetch  | none              | 0.000 (0 of 54)   |

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
ask for, so a wrong credit on a natural call stays below 4.4% at 95%.

It also refuses about half of the fetches the user asked for. Web fetch keeps its whole input in the
record, so its 31 misses of 66 are the checker's own. A consent check that misses that often sends
those calls on to an approval prompt, which the decision point counts as a defect when the user
named the target.

Each memory tool removes its free-text fields, such as the memory's text, its quote and the
retirement's intent quote, before the call record is written. So the checker saw only an item ID and
a version for an edit or a retirement, and no content at all for most saves. It missed 25 of 28
asked retirements and 22 of 29 asked edits, and all 3 swapped credits fell on a save or an edit
whose text the record had dropped. These rates measure the record, so the checker that the decision
point runs has to see the whole call, the text of each memory included, before its memory rates mean
anything.

## Spend

| Calls    | Count | Spend   |
| -------- | ----- | ------- |
| Labeller | 137   | $1.7357 |
| Checker  | 402   | $1.7487 |
| Total    | 539   | $3.4844 |

## Untested

- The prompt is a draft written for this spike, not a shipped prompt, and no other prompt or effort
  ran.
- The labels come from a language model given the deployment's persona, not from the user. The
  labeller saw no memory text either, only the exchanges before the turn.
- The memory tools on their whole input, which the record does not keep.
- A call that sends a message to another person, or any call with a destination: the export holds
  none, so the code half of the consent check never ran.
- One deployment over its first weeks, so its share of fetches and memory changes sets the overall
  rates.
