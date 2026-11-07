# Rules

A rule is plain data that matches a tool call and gives it one outcome: allow, ask or deny. The user
writes rules as YAML files in the definitions, and nixie checks, matches, evaluates and renders them
with code that never calls a model, so the user reads exactly what a rule does and a replay of a
decision gets the same answer. The policy module owns the rule format and these pure functions, and
[rules in force](#rules-in-force) covers how a seed puts them in force. The
[rules design](../../design/platform/policy/rules.md) holds the parts not built yet, and
[the decision point](decision-point.md) covers the stages that decide a call.

## The rule format

A rules file maps each rule ID to its rule, and each ID belongs to one rule across every file under
`rules/`. An ID is lowercase letters and digits in words joined by hyphens, such as
`allow-mail-to-team`, because a slug survives a rename of the file and reads well in a record. Every
field but the outcome is optional, and a field that is missing matches every call:

| Field          | Holds                                                                                  |
| -------------- | -------------------------------------------------------------------------------------- |
| `outcome`      | `allow`, `ask` or `deny`                                                               |
| `tools`        | Tool names or patterns, such as `mail.*`, or a tool variant such as `task.start/atc`   |
| `effects`      | Declared effects                                                                       |
| `contexts`     | `conversation`, `task`, `job` or `coding`                                              |
| `jobs`         | Job IDs                                                                                |
| `checks`       | Argument checks: an argument path, the operator `eq`, `in` or `matches`, and a value   |
| `destinations` | Patterns for the call's destinations                                                   |
| `sources`      | Where the call's content came from: `owner`, `own_data`, `task` or `outside`           |
| `expires`      | When the rule stops matching, as an ISO date and time; a rule with `mandate` needs one |
| `mandate`      | The mandate the rule belongs to                                                        |
| `cel`          | A CEL condition                                                                        |
| `note`         | The user's own words about the rule                                                    |

The parser refuses an unknown field, an empty list and a pattern with a space, and lists each fault
with its file, so a typo in a rule never widens what it matches. Each release publishes the format
as a JSON Schema, the `definitions-rules.schema.json` asset, which the same schema the parser uses
generates. After a change to the format, `bun run --cwd modules/policy rules-schema` rewrites the
committed file, and a test fails while the two differ.

A pattern uses `*` as its only wildcard and matches the whole text, so `*@example.com` matches every
address at that domain and nothing longer. Strings compare in Unicode NFC on both sides. One kind of
wildcard keeps the widening check decidable, which a regular expression would not.

The parser turns each rule into its canonical form: each list sorted with its duplicates dropped,
free text in NFC, and the expiry in UTC. Two files that list the same rule in another order
therefore give the same rule.

## Matching

A rule matches a call when every field it holds matches. A list field reads one way for an allow and
the other way for an ask or a deny, because an allow grants access and must cover all of a call,
while an ask or a deny guards access and catches any part of it:

| Field          | An allow covers the call when                         | An ask or a deny catches the call when   |
| -------------- | ----------------------------------------------------- | ---------------------------------------- |
| `effects`      | the call has effects, and the rule lists each one     | the rule lists one of the call's effects |
| `checks`       | every element of a list argument passes each check    | one element passes each check            |
| `destinations` | the call has destinations, and each matches a pattern | one destination matches a pattern        |
| `sources`      | the call has sources, and the rule lists each one     | the rule lists one of the call's sources |

A check on an argument the call lacks fails, for an allow and an ask alike. A tool name matches the
tool and each of its variants, so `task.start` matches `task.start/atc`, while `task.start/atc`
matches only that variant. A rule stops matching at its expiry, compared with the time of the call,
so a replay agrees.

nixie evaluates no CEL, so a rule with a CEL condition fails closed: an allow with one covers no
call, and an ask or a deny with one catches on its other fields alone.

## Evaluation

Among the rules that match a call, the strictest outcome wins: a deny beats an ask, and an ask beats
an allow. The verdict holds the lowest ID among the matching rules of that outcome, and lists the
others. A rule's place in a file plays no part, so a set of rules means the same in any order, and a
property test checks that over random rule sets and orders. A call that no rule matches gets no
verdict.

## Rendering

Each rule renders as one sentence from a fixed template per field, such as "**Allow** `mail.send`
when every destination matches `*@example.com`." The outcome leads the sentence, the tools or "a
call" follow it, and each other field adds a condition after "when". A `task.start` variant renders
in words, so `task.start/atc` reads "starting a task in atc". The sentence for a rule with a CEL
condition says how the rule fails closed: an allow reads "**Allow** no call", and an ask or a deny
ends "whatever the CEL condition". The note stays out of the sentence, so the user's words never mix
with the rule's.

## The widening check

The widening check compares a rule before and after an edit and classifies the edit as narrowing,
widening or unchanged. Adding an ask or a deny narrows, and adding an allow widens; removing one
does the reverse. Within one outcome, the check asks whether one rule's match lies inside the
other's, field by field: a pattern inside another pattern, a list inside another list, a check that
implies another, and a sooner expiry. An allow narrows when the new match lies inside the old one,
and an ask or a deny narrows when the old match lies inside the new one. An edit that changes only
the note leaves the match the same, so it is unchanged.

A stricter outcome narrows when the old match lies inside the new one. Turning an allow into an ask
or a deny always narrows, because removing an allow and adding an ask both narrow. A looser outcome
widens.

The check never reports a widening as a narrowing. A wildcard inside an inner pattern counts as
covered only by a wildcard in the outer pattern, so the check returns "not inside" for a pair it
cannot prove. Every edit to a rule with a CEL condition widens, because the check cannot read CEL. A
wrong answer therefore costs a prompt, and never access.

## Rules in force

The rule store keeps 3 layers of rules, and each seed lays them over each other in this order:

1. The rules the definitions hold, each with the path of its file.
2. The seeded rules: the version of each rule from the definitions that nixie applied.
3. The runtime changes: a rule that nixie or the user changed or removed while nixie runs, with who
   changed it and why.

A seed compares each rule in the definitions with its seeded version through
[the widening check](#the-widening-check). An edit that narrows applies at once, and the seed record
lists it. An edit that widens waits: the seed gathers every widening into one rule change proposal,
recorded beside the seed record, and the seeded version stays in force. The first seed of a rules
file follows the same check, so its denies and asks apply and its allows wait for one approval. When
a later seed, including a seed of the definitions in force, holds other widenings, it withdraws the
pending proposal and proposes again. An approval applies each widened version as seeded. After a
rejection or a lapse, the seeded version stays in force, and nixie asks again only once the set of
widenings changes. A log reset removes the proposal records, so the first seed after it proposes
again.

A runtime change stays in force over the seeded version and the definitions' version. It records the
definitions' version that it changed, its base, so the store tells whether the definitions moved
since:

- **The definitions hold the runtime version.** The user merged it, so the seed adopts the change
  and the rule's origin becomes the definitions.
- **The definitions still hold the base.** The runtime change stays in force.
- **The definitions hold another version.** The runtime change stays in force, and the seed record
  lists the conflict. Keeping nixie's version makes the definitions' version its base. Keeping the
  repo's version retires the runtime change and applies the definitions' version as seeded, with no
  widening check, because the user chose it. Each choice is a record.

A runtime change, an approval and a resolution each take effect at once through a seed of the
definitions in force, as [skills that nixie wrote](../core/definitions.md#skills-that-nixie-wrote)
do. Each rule has a revision, which goes up by one each time its version in force changes, and a
decision names the rule and the revision that decided it. A log reset keeps the rule store, and the
reset seed restores the rules of the snapshot in force.

The snapshot hash covers each rule in force with its revision, its origin and its runtime change, so
each snapshot holds the revision of every rule in force.
