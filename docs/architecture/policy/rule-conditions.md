# Rule conditions

A rule can hold a `cel` condition, an expression in a subset of the Common Expression Language that
reads the call. The rule matches only when its fixed fields match and the condition is true. The
policy module checks a condition when a rule is written and evaluates it with
`@marcbachmann/cel-js`, the only package that imports the library. [Rules](rules.md) describes the
fixed fields, and [the decision point](decision-point.md) the stages that read the result.

## What a condition reads

A condition sees 8 names, each declared with its CEL type, and nothing else:

| Name           | Type                        | Holds                                                           |
| -------------- | --------------------------- | --------------------------------------------------------------- |
| `tool`         | `string`                    | The tool name with its variant, such as `task.start/sandbox`    |
| `effects`      | `list<string>`              | The tool's declared effects                                     |
| `context`      | `string`                    | `conversation`, `task` or `coding`                              |
| `definition`   | `string`                    | The task definition ID, or an empty string outside a task run   |
| `args`         | `map<string, dyn>`          | The tool input, less each argument the tool declares as content |
| `destinations` | `list<string>`              | The declared destination strings                                |
| `sources`      | `list<string>`              | Where the call's content came from                              |
| `now`          | `google.protobuf.Timestamp` | The time of the call, so a replay agrees                        |

- An integral JSON number in `args` within the 64-bit range becomes a CEL `int`, any other number a
  `double`, and every string and key is in Unicode NFC. A number compares with an `int` or a
  `double` literal alike, but two literals of different number types fail the type check.
- A content argument never reaches `args`, so a condition that reads one errors with `no_such_key`,
  and text from outside never steers a rule. A tool lists as content each argument that holds
  model-written text, such as the `reason` of `prompt_write`.
- A map in the input holds at most 1,000 keys, and `args` itself too.
- A condition never reads memory, secrets, contacts, budgets, the conversation or another call's
  result, because the call holds none of them.

## The subset

A rule may use only this subset, and the conformance suite covers each row:

| Kind              | Allowed                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Literals          | `bool`, `int`, `double`, `string`, and a list of them                                                   |
| Access            | the names above, `.field` and `[index]`                                                                 |
| Operators         | `==` `!=` `<` `<=` `>` `>=`, `&&` `\|\|` `!`, `in`                                                      |
| Functions         | `size`, `has`, and on a string `startsWith`, `endsWith`, `contains`, `lowerAscii`                       |
| Macros            | `exists` and `all` on a list, never one inside another or in another's receiver                         |
| Timestamp methods | `getHours`, `getMinutes`, `getDayOfWeek`, `getDate`, `getMonth`, `getFullYear`, each with a zone string |

A timestamp method needs a zone name that the runtime knows. As in CEL, `getMonth` and
`getDayOfWeek` count from 0. The card shows the month and the day by name. The library reads a
zone's wall time by parsing text in the host's own zone, which moves the hour in a gap of the host's
daylight saving. nixie registers its own method for each part, which reads the part from the zone
alone, and points each timestamp method of a checked condition at it, so a replay gives the same
verdict on every host.

The check refuses every other construct with `condition_not_allowed`, such as arithmetic, `?:`, map
literals, `matches` (a JavaScript regular expression can backtrack for seconds), `bytes`, `map`,
`filter`, conversions and optional types. A macro over `args` itself is refused too, because a map
loops over its keys. A field of `args` can hold a map, which the check cannot see, so a macro whose
receiver is no list ends the evaluation with an error.

## Checking a condition

`checkCondition` runs in this order and stops at the first fault:

1. A rule with `cel` needs a `note`, else `condition_note_missing`.
2. The length limit on the raw text, before any normalization, else `condition_too_large`.
3. The library's parse, which enforces the node limit, else `condition_syntax` or
   `condition_too_large`. Each string literal is then put in NFC, after the parser decoded its
   escapes. A walk over the parsed tree then counts the levels, so a flat chain of `&&` is bound
   too, else `condition_too_large`.
4. A walk over the parsed tree that refuses each construct outside the subset. The library cannot
   drop a built-in from an environment, so the walk is the only gate.
5. The library's type check against the declared names. The result must be `bool`, so `args.flag`
   fails and `args.flag == true` passes, else `condition_type`.
6. The structured view that the card renders.

The limits are 1,000 characters, 100 nodes, 12 levels, 50 elements in a list literal and 3 arguments
to a call. The rules-file parser reports a fault as a problem of the rule's file, as
`<rule>.cel: <fault>: <detail>`, and the seed fails. `rules.editProposedRule` and
`rules.propose_mandate` run the same check and refuse with the one fault it stops at. A stored
condition that fails the check evaluates as an error with the code `condition_invalid`. nixie caches
each parse and check by note presence and text, up to 1,000 entries. The key holds note presence
because step 1 reads it.

## Evaluating a condition

A condition evaluates only after every fixed field of its rule matched, and once per call and
condition text. The result is true, false or an error with a code, which is the library's code such
as `no_such_key`, or one of nixie's: `input_too_large`, `condition_invalid`, `not_bool` and
`evaluation_failed`. An error inside one side of `&&` or `||` that the other side settles is no
error, as CEL defines.

| The rule | `true`          | `false`        | `error`                                                                        |
| -------- | --------------- | -------------- | ------------------------------------------------------------------------------ |
| allow    | covers the call | does not cover | does not cover                                                                 |
| ask      | catches it      | does not catch | catches it                                                                     |
| deny     | catches it      | does not catch | the call asks with the cause `condition_error`, unless another deny catches it |

- The library evaluates synchronously, so the limits bound the work: every list in the input holds
  at most 1,000 elements and the strings total at most 262,144 UTF-16 code units. A larger input
  makes every condition on the call error with `input_too_large`. A unit test times the costliest
  condition over the largest input.
- A deny that errors never refuses a call unseen. The deny stage sets it aside, and the ask-rule
  stage counts it as an ask rule. A deny that errors therefore asks where it meant to refuse,
  whatever the order of the rule IDs. A deny that matches wins over one that errored. To refuse a
  call that omits an argument, write the condition so a missing argument gives true, such as
  `!has(args.to) || …`.
- The decision lists each rule that errored in `conditionErrors`, with the rule ID, its revision and
  the code, and never the library's message, which can quote argument text. The approval card shows
  each entry, and the call's result tells the model the rule's ID and the code. For an allow rule
  that a missing argument stopped, it also names the argument, which is a key of the call and not
  argument text, and asks for a new call with it. It never names a content argument. An ask rule
  that matches a memory write beside an error holds the call as an action card, which asks about the
  call as it is, because the card that proposes a memory entry has no place to show the error.
- The lift check and the destination permissions read allow rules through `isRuleMatch`, so they
  evaluate a condition the same way. `listUncoveredMemoryWrites` matches against a call it builds,
  so it counts every condition as an error.

## The card

`describeCondition` builds a `RuleCondition` for each rule with a condition: the note, `noteBy`
(`you` for a rule from the definitions repo, from an edit through `rules.editProposedRule` or from a
mandate that the user proposed, `nixie` for a rule of a mandate that nixie proposed through
`rules.propose_mandate`), the words and the raw CEL as `source`. The host renders the words from the
view, so every client shows the same sentence. A card for a rule with a condition shows, in order:

1. The rule's sentence, which ends "when its condition holds".
2. The note, labelled "Your note" or "nixie's note".
3. The condition in words. A part with no phrase shows inline as code.
4. The raw CEL behind a "Show the expression" control.

A card for a mandate with several rules shows each condition under its own rule. The host's proposal
list carries the condition of each version of a changed rule.

The approval card, the rule notice after an answer, the mandates page and the `rules.list` tool show
all 4 parts. `nixie rules list` and `nixie proposals list` print only the note and the words. No
client form edits a condition: the web client's rule form calls `rules.editRule`, which keeps a
rule's condition as it is.

## How a rule with a condition arrives

| Path                                           | With a condition                        |
| ---------------------------------------------- | --------------------------------------- |
| a seed from the definitions repo               | applies at once; a fault fails the seed |
| `buildProposedRule` and `buildAlwaysAllowRule` | never write one                         |
| `rules.editProposedRule`                       | accepted when `checkCondition` passes   |
| `rules.propose_mandate`                        | accepted when `checkCondition` passes   |
| `rules.editRule` from the client               | keeps the condition                     |
| `rules.removeRule` from the client             | removes the rule with its condition     |

A proposal that adds or changes a condition widens, so its card has the `always_ask` risk class, or
`lifting` with a lift, and the answer takes a passkey. A definitions repo that holds a rule with
`cel` and no note fails its seed.

## The conformance suite

The policy module holds a table of cases, each an expression, an input and the result of the
[CEL language definition](https://github.com/google/cel-spec/blob/master/doc/langdef.md). It covers
each row of the subset (true, false and error), error absorption, `in` and `has`, NFC, JSON numbers,
each timestamp method across a daylight-saving change, each refused construct, each limit at and
over, and the words of each view kind. Where the library departs from the definition, the case pins
the library's result with a comment. The library is pinned at an exact version, and a bump merges
only with the suite green. A replay evaluates each condition with the library in force, and the
suite checks that a bump keeps past verdicts.
