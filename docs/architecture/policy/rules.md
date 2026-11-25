# Rules

A rule is plain data that matches a tool call and gives it one outcome: allow, ask or deny. The user
writes rules as YAML files in the definitions, and nixie checks, matches, evaluates and renders them
with code that never calls a model, so the user reads exactly what a rule does and a replay of a
decision gets the same answer. The policy module owns the rule format and these pure functions, and
[rules in force](#rules-in-force) covers how a seed puts them in force. A seed is the step that
reads the definitions and puts them in force, as [seeding](../core/definitions.md#seeding)
describes. The [rules design](../../design/platform/policy/rules.md) holds the parts not built yet,
and [the decision point](decision-point.md) covers the stages that decide a call.

An allow rule can allow any call, with 2 exceptions. A call that widens the policy or raises a
budget always asks, so no rule can give the assistant more room than the user approved. A call that
spends passes only an allow rule with a [lift](budgets.md#lifts), which caps each purchase and
charges a budget. A new tool never adds a third exception.

## The rule format

A rules file maps each rule ID to its rule, and each ID belongs to one rule across every file under
`rules/`. An ID is lowercase letters and digits in words joined by hyphens, such as
`allow-mail-to-team`, because a slug survives a rename of the file and reads well in a record. Every
field but the outcome is optional, and a field that is missing matches every call:

| Field          | Holds                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `outcome`      | `allow`, `ask` or `deny`                                                                                  |
| `tools`        | Tool names or patterns, such as `mail.*`, or a tool variant such as `task.start/sandbox`                  |
| `effects`      | Declared effects                                                                                          |
| `contexts`     | `conversation`, `task` or `coding`; `task` covers a task that nixie starts and a task run of a definition |
| `definitions`  | Task definition IDs; the rule matches a task run of one of them                                           |
| `checks`       | Argument checks: an argument path, the operator `eq`, `in` or `matches`, and a value                      |
| `destinations` | Patterns for the call's destinations                                                                      |
| `sources`      | Where the call's content came from: `owner`, `own_data`, `task` or `outside`                              |
| `expires`      | When the rule stops matching, as an ISO date and time; a rule with `mandate` needs one                    |
| `mandate`      | The mandate the rule belongs to                                                                           |
| `lift`         | On an allow rule: `perAction` dollars and a `budget` ID, as [budgets](budgets.md#lifts) describes         |
| `cel`          | A CEL condition                                                                                           |
| `note`         | The user's own words about the rule                                                                       |

The parser refuses an empty list, a pattern with a space and an unknown field inside a check, and
lists each fault with its file. A rule that holds an unknown top-level field fails closed, so a
newer release's field never stops an older release from seeding: the seed skips an allow rule whole,
so it matches nothing, and drops only the field from an ask or a deny rule, so the rule matches
more. The seed logs a warning with the rule and the field. Each release publishes the format as a
JSON Schema, the `definitions-rules.schema.json` asset, generated from the schema that the parser
uses. After a change to the format, `bun run --cwd modules/policy rules-schema` rewrites the
committed file, and a test fails while the two differ.

A pattern uses `*` as its only wildcard and matches the whole text, so `*@example.com` matches every
address at that domain and nothing longer. Strings compare in Unicode NFC on both sides. One kind of
wildcard keeps the widening check decidable, which a regular expression would not.

The parser of a rules file reads 2 deprecated names: `jobs` for `definitions`, and the context `job`
for `task`. The parser refuses a rule that holds both `jobs` and `definitions`, because merging the
lists could widen an allow rule. The JSON Schema marks the deprecated names. nixie stores and
exports every rule with `definitions` and `task`, and reads a stored rule in no other form.

The parser reads the context `job` as `task`, which covers both kinds of task. A rule with
`contexts: [job]` or `contexts: [task]` therefore matches a task that nixie starts from chat as well
as a definition's task run. A `definitions` or `jobs` list still limits a rule to the task runs of
the definitions it names, so name the definitions in a rule that must match only them.

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

A check on an argument that the call lacks fails, whatever the rule's outcome. A tool name matches
the tool and each of its variants, so `task.start` matches `task.start/sandbox`, while
`task.start/sandbox` matches only that variant. A rule stops matching at its expiry, compared with
the time of the call, so a replay agrees.

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
in words, so `task.start/sandbox` reads "starting a task in sandbox". The sentence for a rule with a
CEL condition says how the rule fails closed: an allow reads "**Allow** no call", and an ask or a
deny ends "whatever the CEL condition". The note stays out of the sentence, so the user's words
never mix with the rule's.

## The widening check

The widening check compares a rule before and after an edit and classifies the edit as narrowing,
widening or unchanged. Adding an ask or a deny narrows, and adding an allow widens; removing one
does the reverse. Within one outcome, the check asks whether one rule's match lies inside the
other's, field by field: a pattern inside another pattern, a list inside another list, a check that
implies another, and a sooner expiry. An allow narrows when the new match lies inside the old one,
and an ask or a deny narrows when the old match lies inside the new one. An edit that changes only
the note leaves the match the same, so it is unchanged. A lift widens when an edit adds one, raises
`perAction` or names another budget, and narrows when an edit removes one or lowers `perAction`. An
allow that comes to list `skill_write` by its exact name widens, even when the name narrows its
match, because that name lets a skill write apply at once, as
[Writes under a rule](../core/skills.md#writes-under-a-rule) describes. An allow that drops the name
narrows.

Turning an allow into an ask or a deny narrows whatever the match, because removing an allow and
adding an ask both narrow. Turning an ask into a deny narrows when the old match lies inside the new
one, and widens otherwise. A looser outcome widens.

The check never reports a widening as a narrowing. When the check tests whether pattern A lies
inside pattern B, a wildcard in A counts as covered only by a wildcard in B, so the check returns
"not inside" for a pair it cannot prove. Every edit to a rule with a CEL condition widens, because
the check cannot read CEL. For a change made inside nixie, a wrong answer therefore costs a prompt
or a refusal, and never access. A seed applies every edit whatever its class, as
[rules in force](#rules-in-force) describes.

## Rules in force

The rule store keeps 3 layers of rules:

1. The rules the definitions hold, each with the path of its file.
2. The seeded rules: the version of each rule from the definitions that the last seed applied.
3. The runtime changes: a rule that nixie or the user changed or removed while nixie runs, with who
   changed it and why.

The rule in force is the runtime change when one exists, and the seeded version otherwise. A seed
compares each rule in the definitions with its seeded version through
[the widening check](#the-widening-check), and applies every edit at once, a widening as much as a
narrowing, because the user wrote the repo
([0016](../../decisions/0016-trust-the-definitions-repo.md)). The seed record lists each edit with
its class.

A seed never writes a rule change proposal, the `rules.change_proposed` record that holds a set of
widenings from the definitions until the user answers it. Each seed withdraws every pending
`rules.change_proposed` that the log holds. A proposed rule and a mandate use other records, so a
seed leaves them pending, although their rows share the `rule_change` family.

A widening that starts inside nixie asks the user first. Always allow on an approval card, a
[proposed rule](#proposed-rules) and a [mandate](#mandates) each wait for the user's answer, and the
device calls that change a rule refuse a widening, as
[narrowing a rule from the client](#narrowing-a-rule-from-the-client) describes.

Trusting the repo has 3 consequences:

- A budget raise or a lift rule from the repo goes in force with no
  [passkey check](passkeys.md#which-answers-take-the-passkey). The same change made inside nixie
  still takes the passkey, in the `always_ask` risk class for a budget raise and the `lifting` risk
  class for a lift.
- The app can never keep out a widening that the repo holds. To keep a widening out, remove it from
  the repo.
- A nixie release can drop an effect from a tool's declaration, and the next seed applies the drop
  with no ask.

A runtime change stays in force over the seeded version and the definitions' version. It records the
definitions' version that it changed, its base, so the rule store can tell whether the definitions
moved since:

- **The definitions hold the runtime version.** The user merged it, so the seed adopts the change
  and the rule's origin becomes the definitions.
- **The definitions still hold the base.** The runtime change stays in force.
- **The definitions hold another version.** The runtime change stays in force, and the seed record
  lists the conflict. Keeping nixie's version makes the definitions' version its base. Keeping the
  repo's version retires the runtime change and applies the definitions' version as seeded, with no
  widening check, because the user chose it. The rule store writes a record of each choice.

A seed of the definitions in force reads the snapshot already in force, with no read of the repo. A
runtime change, an approved proposal and a resolved conflict each take effect at once through one,
as [skills that nixie wrote](../core/definitions.md#skills-that-nixie-wrote) do. Each rule has a
revision, which goes up by one each time its version in force changes, and a decision names the rule
and the revision that decided it. A log reset keeps the rule store, and the seed after the reset
restores the rules of the snapshot in force, as [seeding](../core/definitions.md#seeding) describes.

The [snapshot hash](../core/definitions.md#the-snapshot-hash) covers each rule in force with its
revision, its origin and its runtime change, so each snapshot holds the revision of every rule in
force.

## Proposed rules

When the user approves the same kind of call often enough within a window and declines none, nixie
proposes the narrowest allow rule that covers those calls. The `policy.proposed_rules` settings set
the counts and the window. A call that no rule matches asks with the cause `no_rule`, and the user's
answer to that action proposal joins a gap group. The group's key is the tool with its variant, the
context and the sorted destinations, hashed with SHA-256. The `gap_answers` and `gap_groups`
projections hold the group hash, each answer and its time, and never a destination or an argument.

After each answer that joins a group, the rule store checks the group in a transaction of its own,
and proposes a rule when all of these hold:

1. The group holds at least `policy.proposed_rules.approvals` approved answers within
   `policy.proposed_rules.window_days`. An answer whose action proposal lost its erasable fields to
   a record forget does not count.
2. The group holds no declined answer in that window.
3. The group has no open proposed rule, and its `quiet_until` lies before now.

`buildProposedRule` builds the rule from the counted calls: the tool, the context, the task
definition when every call came from one, the exact destinations, the union of the sources, and an
`eq` check on each scalar argument that held one value in every call. An argument that the tool
declares as content gets no check, and neither does a list. The rule parser checks the result as it
checks every rule, and a test checks that every counted call matches it.

The proposal is a row of the `rule_change` family with the cause `proposed_rule` and the
`always_ask` risk class. Its record, `rules.rule_proposed`, keeps the rule in erasable fields, so a
record forget of the proposal removes it. The card offers these choices:

| Control | What happens                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------- |
| Approve | A runtime change adds the rule as `proposed-<short ID>`, with the reason "proposed after 3 approvals" |
| Not now | The decline choice: the group stays quiet for `policy.proposed_rules.quiet_days`                      |
| Defer   | As [the approval record](approvals.md#defer) defines it                                               |
| Edit    | Sends `rules.editProposedRule`, which withdraws the card and opens a new one with the edited rule     |

A lapse of the proposal keeps the group quiet as Not now does, and a decline of a new action
proposal in the group withdraws the open proposed rule. A `rules.change_lapsed` record for the
proposed rule closes it too. That record holds no quiet time, so the group keeps the lapse time, and
the rule store adds the quiet days to it when it checks the group. `rules.editProposedRule` keeps
the edited rule an allow rule, and gives the new card the `lifting` risk class when the rule carries
a lift or lets an always-ask effect through. It returns `INVALID` with each fault the parser found.
At start, the rule store checks each group that gained an answer since its last check, so a crash
between an answer and its check loses no proposal. An approved proposed rule goes into
[the rule export](#the-rule-export), and Undo on its notice removes it.

## Mandates

A mandate gives nixie authority for a period. It holds 1 to 10 allow rules that share a mandate ID
and an expiry, and the user proposes it in the web client's mandates page or through the
conversation tool `rules.propose_mandate`, which only the conversation holds and which declares the
`note` effect, because its call writes a proposal and nothing else. `policy.mandates.max_hours`
limits the expiry, counted from the proposal, and the default expiry is the next midnight in the
user's time zone. The tool's description states that limit, read from the setting, so nixie knows
the longest mandate before she proposes one.

The rule store refuses a past or too late expiry, and each refusal carries the facts that fix it, in
the user's zone. `expires_past` carries `now`, the time the expiry was compared against.
`expires_beyond_max` carries `maxHours` and `latestExpiry`, the latest end the proposal could ask
for. The tool returns them in its error message, the API returns them as `expiry` in the data of the
`INVALID` error, and the mandates page shows one sentence built from them.

The proposal is a row of the `rule_change` family, with the cause `mandate`, the `lifting` risk
class when a rule lifts the always-ask set and `always_ask` otherwise. Its deadline is the expiry,
so a late approval starts nothing. The card shows the title, each rule's sentence and the end time,
and, for a rule that reaches memory, the memory writes it will not cover
([what a rule will not cover](../memory/writes.md#what-a-rule-will-not-cover)).

- An approval writes each rule as a new runtime rule with the ID `<mandate ID>-<number>`, with
  `mandate` and `expires` set, and `rules.mandate_started`, in one transaction. A seed of the
  definitions in force then puts the rules in force.
- The rule store refuses an edit of a mandate rule, and refuses a runtime change that is not a
  mandate over the ID of a mandate rule.
- The decision point stops a rule at its `expires`, and a replay of an earlier decision uses the
  snapshot its record names.
- End now, `rules.endMandate`, and a periodic timer each retire the mandate's runtime changes, write
  one `rules.mandate_ended` with the reason `ended` or `expired`, and run a seed. Neither writes a
  runtime removal, so the export never offers to remove a rule of the user's. At start, the timer
  ends each mandate whose expiry passed while nixie was down.
- The export filters out each change whose rule holds `mandate`.
- The server adds a line to the [events block](../core/conversation-turns.md#the-events-block) when
  a mandate starts and when it ends.

### Reading mandates and rules

nixie reads her mandates and her standing rules with the conversation tool `rules.list`, which
declares the `read` effect, so the starter rule `allow-reads` lets it through. It returns 2 lists:

- `mandates`: the 50 newest mandates, the newest proposal first. Each holds the proposal's short ID,
  the title, the state, the expiry and each rule's sentence. A forget of the proposal leaves the
  title null and the rules empty.
- `rules`: each allow and ask rule in force whose `contexts` match the conversation, with its ID and
  sentence. It leaves out deny rules, mandate rules, rules limited to task definitions and expired
  rules.

The tool reads each mandate's state from its newest record:

| State      | Record                                      |
| ---------- | ------------------------------------------- |
| `pending`  | `rules.mandate_proposed`                    |
| `active`   | `rules.mandate_started`                     |
| `rejected` | `rules.mandate_declined`                    |
| `lapsed`   | `rules.mandate_lapsed`                      |
| `ended`    | `rules.mandate_ended` with reason `ended`   |
| `expired`  | `rules.mandate_ended` with reason `expired` |

A pending mandate past its expiry reads as `lapsed`, and an active one as `expired`, before the
sweep that closes it runs.

## The rule export

nixie exports the runtime changes in force to the definitions repo through the
[definitions export](../core/definitions.md#the-export-to-the-definitions-repo), as one rolling pull
request on the `nixie/rules` branch. A runtime change in a mandate never exports. The export's ID is
a hash of the exported changes, each with its base, the definitions' version and the file that holds
it, the count of runtime changes that left force, and the record of the seed in force. Any change to
those, such as a new runtime change, a choice on a conflict or a new seed, makes a new export, even
when the set or the repo returns to one an earlier export held. The export builds the branch again
on the newest commit of the base branch, which updates the open pull request, and marks each earlier
export closed without closing that pull request. When the set empties, the export closes a pull
request still open on the branch, and leaves a merged one as it is.

The export edits the rules files in place: it replaces or removes the top-level block of each
changed rule, and appends a new rule to `rules/nixie.yaml`. Every other line, comments included,
stays as the user wrote it, and a file that a removal leaves empty is deleted. The pull request's
body lists each change as its sentence, who made it and why. An export to definitions below format 3
fails and opens no pull request, because those formats apply no rule file. An export that would edit
a prompt part under `rules/`, such as a `rules/nixie.yaml` that the `prompts:` map names, fails the
same way.

## Narrowing a rule from the client

The web client changes a rule in force through 2 calls of the device API, and each one only narrows:

- `rules.removeRule` removes an allow rule. The call refuses to remove an ask or a deny rule,
  because the widening check classes that removal as a widening.
- `rules.editRule` replaces the destinations of an allow rule. The call refuses an edit that adds a
  destination, and refuses an empty list.

Both calls name the revision the client showed, and refuse with the current revision when it has
moved. Both run as checked actions with a client action ID, write a runtime change in one
transaction, and run the seed of the definitions in force after it commits. The client uses them to
undo an Always allow and to drop destinations from the rule it added. `rules.readRule` reads a rule
in force with its sentence, outcome, destinations and revision.

## Commands and the proposals screen

The host commands read and answer the rule store, and each prints JSON:

| Command                                       | Does                                                               |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `nixie rules list`                            | Lists each rule in force, its sentence, revision and origin        |
| `nixie rules conflicts`                       | Lists each conflict with nixie's, the repo's and the base versions |
| `nixie rules resolve <id> --keep nixie\|repo` | Resolves the conflict on that rule                                 |
| `nixie proposals list`                        | Lists each pending rule change proposal                            |
| `nixie proposals approve <id>`                | Puts the proposal's widenings in force                             |
| `nixie proposals reject <id> --reason <why>`  | Closes the proposal with your reason                               |
| `nixie mandates list`                         | Lists each active mandate, its rules and its end                   |
| `nixie mandates end <id>`                     | Ends the mandate, as End now does                                  |

The `nixie proposals` commands answer only the rule change proposals that the log holds, because a
seed never writes one. The next seed withdraws each one that is still pending, and leaves a pending
proposed rule or mandate as it is.

The approvals page in the web client, at `/proposals`, lists the same pending proposals among every
other kind, each change as the sentence before and after it, and answers them through
`approvals.answerProposal`. A rejection there needs a reason too. An hourly sweep records the lapse
of each proposal left past the shared proposal lapse time.
