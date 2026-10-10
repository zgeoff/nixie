# Rules

- Status: Proposed
- Decisions: [0004](../../decisions/0004-rule-engine.md),
  [0005](../../decisions/0005-effects-and-taint.md),
  [0006](../../decisions/0006-approval-record.md),
  [0013](../../decisions/0013-definition-versioning.md),
  [0018](../../decisions/0018-main-thread-and-tasks.md), [0020](../../decisions/0020-deployment.md),
  [0023](../../decisions/0023-lifting-always-ask.md)

A rule is plain data in nixie's own format, under [0004](../../decisions/0004-rule-engine.md): it
matches a tool call by its tool, effects, context, arguments and destinations, and gives one
outcome: allow, ask or deny. Rules live in nixie's database, seeded from the owner's definitions
under [0020](../../decisions/0020-deployment.md), and the
[decision point](./decision-point.md#the-pipeline) reads them at 3 of its stages. Among the rules
that match a call, the strictest outcome wins, so rule order never matters. Each rule keeps one ID
for its life and a revision per edit, and code can tell whether an edit widens access. Everything in
this doc beyond the decisions it links is a proposal.

## The rule format

A rule holds these fields, and every field except the ID and the outcome is optional. A missing
match field matches every call.

| Field          | Holds                                                           |
| -------------- | --------------------------------------------------------------- |
| `id`           | A stable slug, unique in the deployment                         |
| `outcome`      | `allow`, `ask` or `deny`                                        |
| `tools`        | Tool names, each exact or a pattern such as `mail.*`            |
| `effects`      | Declared effects                                                |
| `contexts`     | `conversation`, `task`, `job` or `coding`                       |
| `jobs`         | Job IDs, for a rule that applies to some jobs only              |
| `checks`       | Argument checks, each an argument path, an operator and a value |
| `destinations` | Patterns that the call's destinations must match                |
| `lift`         | For a lifting rule: a per-action cap and the budget it draws on |
| `expires`      | When the rule stops matching, for a grant                       |
| `grant`        | The grant the rule belongs to                                   |
| `cel`          | A CEL condition, for a rule the fixed checks cannot express     |
| `note`         | The owner's own words about the rule                            |

The checks are the 3 that 0004 fixes: `eq` compares an argument with one value, `in` with a list of
values, and `matches` with a pattern. Strings compare in Unicode NFC on both sides, the form the
snapshot hash below uses, so 2 spellings of one name match the same calls. A saved contact name in
the consent check matches as literal text between word boundaries, never as a pattern. A pattern
uses `*` as its only wildcard and matches the whole string, so `*@example.com` matches every address
at that domain. **Why:** a pattern with one kind of wildcard keeps the widening check below
decidable in plain code, and the owner reads it at a glance. A regular expression would give the
owner more power and give the check a problem it cannot solve in general.

Each rule also carries metadata that sits outside its match: its source (a definitions commit, or
the approval that created it), who proposed it (the owner, or nixie from a task, as 0023 requires
for a lift), when it was created, and when it last fired. Last fired is a projection that the
decision records update, not part of the rule.

### Matching

A rule matches a call when every field it holds matches. Effects, list arguments and destinations
read strictly in both directions:

- **An allow rule covers a call only when it covers all of it.** Its effects must include every
  effect the call has, a check on a list argument must pass for every element, and every destination
  must match one of its patterns. An allow rule for `read` and `fetch` never covers a tool that also
  sends.
- **A deny or ask rule catches a call when it catches any part of it.** One shared effect, one
  element that passes a check, or one destination that matches is enough. "Ask before any `delete`"
  catches a tool that writes and deletes.

A rule with a CEL condition is valid only when the fixed checks cannot express it, as 0004 allows.
nixie cannot analyse it, so the widening check treats every edit to it as widening. No starter rule
uses CEL, and the first rule that needs it picks the library.

### Rendering

Every rule renders as one sentence from its fields, and the client edits it through a form with one
control per field, as the principle "The owner has root" requires. "Allow `mail.send` in any context
when every recipient matches `*@example.com`" renders from 3 fields. The sentence comes from a
template per field, never from a model, so the owner reads exactly what the rule matches.

## Evaluation order

The decision point checks deny rules at stage 3, ask rules at stage 6 and allow rules at stage 7, so
among the rules that match a call, a deny beats an ask and an ask beats an allow. A rule's position
in a list plays no part. When several rules of the winning outcome match, the record names the one
with the lowest ID and lists the others. **Why:** with the strictest outcome winning, each rule
affects decisions in one direction only, so the meaning of a set of rules does not depend on how it
is listed. That property makes the snapshot hash below order-free and lets the widening check judge
one edit at a time. The [prototype](../../../spikes/policy-rules/README.md) confirmed it: no
decision changed under 200 rule orders.

One consequence shapes "always allow". An allow rule never overrides an ask rule that matches the
same call, so a prompt from the owner's ask rule offers "change this rule" in place of "always
allow", which [approvals](./approvals.md#always-allow) covers.

## Rule identity

A rule keeps its ID for its whole life, and each edit makes a new revision. A decision records the
rule's ID and revision.

- **Seeded rules** take their ID from their key in the owner's definitions, so the next seed finds
  the same rule, as [0020](../../decisions/0020-deployment.md) needs to mark a runtime edit as an
  override.
- **Runtime rules** get a slug that nixie builds from the tool and the destination with a short
  random suffix, such as `mail-send-sam-k3f9`.
- **A deleted rule's ID** is never reused, so an old record never points at a different rule.

A revision is the rule's revision number and the hash of its canonical form. **Why:** the last-fired
record from [0006](../../decisions/0006-approval-record.md) and the owner's review of stale rules
follow the rule across edits by its ID, while the revision tells a replay exactly which version
decided. An edit that changes what a rule is for, such as a new tool, is a removal and an add, so
the owner sees the old rule's history end.

## The snapshot hash

Every record carries the hash of the definitions in force, under
[0013](../../decisions/0013-definition-versioning.md). nixie computes it as SHA-256 over a canonical
form of the whole definition set:

- **Persona and job instructions,** written in markdown, normalise to Unicode NFC with LF line
  endings, no byte order mark and exactly one final newline. Spaces at the end of a line stay,
  because 2 of them are a line break in markdown. The canonical form holds each document's hash.
- **Jobs** sort by ID, with their schedule, their instructions' hash, their tool list and their
  allowed destinations.
- **Policy** holds the rules sorted by ID, the complete tool declarations sorted by tool name, the
  budgets' limits, the IDs of known contacts, and the versioned checker definitions. A checker
  definition includes its prompt hash and the model and adapter settings that affect its verdict.
  The consent, memory assertion and retirement-intent checks keep distinct definitions. A changed
  checker produces a changed snapshot even when no rule changed.
- **Objects** serialise as JSON with sorted keys and no whitespace, and every set-valued field, such
  as a rule's tools or a job's tool list, sorts and drops duplicates.

The form leaves out state that changes without an edit: when a rule last fired, how much of a budget
is spent, and the rules' metadata. **Why:** the hash then changes exactly when the definitions do,
and a replay with the snapshot reproduces every deterministic decision. The
[prototype](../../../spikes/policy-rules/README.md) kept one hash across 1,000 equivalent
reorderings, line ending changes and duplicated list members, and the hash moved on each of 18 real
changes, a trailing hard line break among them.

nixie keeps each snapshot in its database under its hash, with the definitions commit as a label
under 0013. Each part of the form, the persona, each job and the policy, also has its own hash, so a
task records the persona and job versions it pinned next to the snapshot of the policy in force.

## The widening check

nixie classifies each rule edit as narrowing, widening or unchanged, and only a narrowing applies at
once under [0005](../../decisions/0005-effects-and-taint.md). An edit narrows when the new rule's
match lies inside the old one's for an allow rule, or the old one's lies inside the new one's for a
deny or ask rule:

- Adding a deny or ask rule, and removing an allow rule, narrow.
- Adding an allow rule, and removing a deny or ask rule, widen.
- A stricter outcome over the same or a wider match narrows; a looser outcome widens.
- Within one outcome, the check compares field by field: a tool or destination pattern inside
  another, a context list inside another, a check that implies another, a sooner expiry, and a lower
  lift cap on the same budget.

The check is conservative: when it cannot prove that one pattern lies inside another, it reports a
widening, and nixie asks. It never reports a widening as a narrowing. The prototype classified 26 of
27 edits as expected, and the one miss was a pattern with 2 wildcards that the check reported as
widening. A set of edits applied together is narrowing when each edit is, because the strictest
outcome wins.

Effect declarations, budgets and known contacts follow the same rule: adding an effect to a tool,
lowering a budget and removing a known contact narrow, and their opposites widen.

## Gaps and proposed rules

A prompt because no rule matched is a gap under 0005. nixie groups these prompts by tool, context
and destinations, and the live view shows each group with its count and its approvals.

When the owner approves 3 calls of one group within 30 days and rejects none, nixie proposes the
narrowest rule that covers all of them, by default, and the owner can change both numbers. The
proposed rule names the tool, lists the destinations the owner approved, and keeps an `eq` check for
each argument that held the same value in every approval, leaving out the arguments the tool
declares as free-text content. Creating it is a widening, so the proposal joins the digest sheet as
an always-ask item, and the owner can edit it before approving. A rejected proposal stays quiet for
30 days. **Why:** 3 identical approvals mark a habit and keep a one-off from becoming a rule, and
the rule covers only what the owner already approved.

## Grants with expiries

A grant is authority for a period, such as "full authority over my calendar invites today", under
[0018](../../decisions/0018-main-thread-and-tasks.md). nixie represents it as one or more ordinary
rules that share a grant ID and an expiry.

1. The owner states the grant in the conversation, or opens the grant form in the client.
2. nixie writes the grant as rules from the owner's words and posts them as one proposal. Every
   grant widens the rules, so the proposal is always-ask, and it shows each rule's sentence and the
   time it ends.
3. The owner approves, edits or rejects it. An approved grant takes effect at once.

The expiry defaults to the end of the owner's day, and the form offers a number of hours instead. A
grant must have an expiry, and a rule with none is an ordinary rule. A grant can hold a lifting
rule, and then its approval is a lifting approval under
[0023](../../decisions/0023-lifting-always-ask.md).

The client shows every active grant with the time it has left, and one action ends it at once, which
narrows and so applies without a prompt. A grant's rules stop matching at the expiry time, which the
decision point checks against the call's time, so a replay agrees. A timer then removes the rules
with a record, which makes a new snapshot, and the conversation learns that the grant ended. The
scripted grant scenario in the prototype prompted once to create the grant, sent invites to new
attendees with no prompt during it, and held back the first invite after it ended.

## The starter rule set

The starter rule set ships as a template in the definitions scaffold that an owner copies, never as
rules built into the public repo, because the principle "Behaviour is data" keeps policy out of the
system tier. It has 9 rules:

| Rule                        | Outcome | Matches                                               |
| --------------------------- | ------- | ----------------------------------------------------- |
| `allow-reads`               | Allow   | Effects `read` and `fetch`                            |
| `allow-notes`               | Allow   | Effect `note`                                         |
| `allow-service-writes`      | Allow   | Effect `write`, which the service can restore         |
| `allow-sends-within-limits` | Allow   | Effect `send`, still bound by the destination limits  |
| `allow-sandboxed-code`      | Allow   | Effect `run_code`                                     |
| `allow-narrowing`           | Allow   | Effects `policy_narrow` and `budget_lower`            |
| `ask-permanent-deletes`     | Ask     | Effect `delete`                                       |
| `ask-jobs-that-act`         | Ask     | Creating a job with a tool that sends or deletes      |
| `ask-exports`               | Ask     | Effect `export`, such as a memory or event log export |

The always-ask set and the destination limits hold whatever the starter rules say, so the set is
permissive inside those bounds. An effect it does not mention, such as `device`, falls to "no rule
matched" until the owner adds a rule. In the prototype, the starter set raised 16 prompts over 14
scenarios, each one intended. A cautious variant that asks before every write and every send raised
22, all 6 extra prompts in one run of the inbox job. The owner chose the permissive posture in
[0028](../../decisions/0028-policy-design.md).

### Jobs

No starter rule allows creating a job. A job the owner asks for in a direct message runs through
consent at stage 8 of the [decision point](./decision-point.md#the-pipeline), with no prompt, and a
job nobody asked for, such as one a task proposes, falls to "no rule matched" and asks.
`ask-jobs-that-act` still asks for a job whose tools send or delete, whoever asked.

Every job creation or change posts a notice, however the decision point allowed it: a line under
nixie's reply, such as "Scheduled: inbox triage, daily 7:00", with an undo action. Undo removes the
new job or restores the old definition, which applies at once. The live view lists every job with
its schedule, its tool list and the record that created it. **Why:** a job acts on its own long
after the conversation that made it, so the owner sees each one when it starts and can find all of
them in one place.
