# Rules

- Decisions: [0004](../../../decisions/0004-rule-engine.md),
  [0005](../../../decisions/0005-effects-and-taint.md),
  [0006](../../../decisions/0006-approval-record.md),
  [0013](../../../decisions/0013-definition-versioning.md),
  [0018](../../../decisions/0018-the-conversation-and-tasks.md),
  [0020](../../../decisions/0020-deployment.md),
  [0023](../../../decisions/0023-lifting-always-ask.md),
  [0028](../../../decisions/0028-policy-design.md)

A rule is plain data in nixie's own format: it matches a tool call by its tool, effects, context,
arguments and destinations, and gives one outcome: allow, ask or deny. Rules live in nixie's
database, seeded from your definitions, and the [decision point](decision-point.md) reads them at 3
of its stages. Among the rules that match a call, the strictest outcome wins. Each rule keeps one ID
for its life and a revision per edit, and code tells whether an edit widens access.

## The rule format

Every field except the ID and the outcome is optional, and a missing match field matches every call.

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
| `expires`      | When the rule stops matching, for a mandate                     |
| `mandate`      | The mandate the rule belongs to                                 |
| `cel`          | A CEL condition, for a rule the fixed checks cannot express     |
| `note`         | Your own words about the rule                                   |

Rule files in the definitions repo are YAML, checked against a JSON Schema that nixie generates from
the rule format, both when the repo seeds the database and when nixie exports runtime rules.

The checks are `eq` against one value, `in` against a list, and `matches` against a pattern. Strings
compare in Unicode NFC on both sides. A pattern uses `*` as its only wildcard and matches the whole
string, so `*@example.com` matches every address at that domain. **Why:** one kind of wildcard keeps
the widening check decidable in plain code, and you read the pattern at a glance; a regular
expression would give the check a problem it cannot solve in general. A saved contact name in the
consent check matches as literal text between word boundaries, never as a pattern.

A rule with a CEL condition is valid only when the fixed checks cannot express it. The widening
check cannot analyse CEL, so it treats every edit to such a rule as a widening. No starter rule uses
CEL, and the first rule that needs it picks the library.

Each rule also carries metadata outside its match: its source (a definitions commit, or the approval
that created it), who proposed it (you, or nixie from a task), when it was created, and when it last
fired. Last fired is a projection that decision records update.

### Matching

A rule matches a call when every field it holds matches. Effects, list arguments and destinations
read strictly in both directions:

- **An allow rule covers a call only when it covers all of it.** Its effects include every effect
  the call has, a check on a list argument passes for every element, and every destination matches
  one of its patterns. An allow rule for `read` and `fetch` never covers a tool that also sends.
- **A deny or ask rule catches a call when it catches any part of it.** One shared effect, one
  element that passes a check, or one destination that matches is enough.

### Rendering

Every rule renders as one sentence from a fixed template per field, never from a model, and the
client edits it through a form with one control per field, so you read exactly what the rule
matches.

## Evaluation order

The decision point checks deny rules at stage 3, ask rules at stage 6 and allow rules at stage 7, so
a deny beats an ask and an ask beats an allow. A rule's position in a list plays no part. When
several rules of the winning outcome match, the record names the one with the lowest ID and lists
the others. **Why:** with the strictest outcome winning, a set of rules means the same however it is
listed, which keeps the snapshot hash order-free and lets the widening check judge one edit at a
time.

An allow rule never overrides an ask rule that matches the same call, so a prompt from your ask rule
offers "change this rule" in place of "always allow".

## Rule identity

A rule keeps its ID for its whole life, and each edit makes a new revision: a revision number and
the hash of the rule's canonical form. A decision records the ID and the revision.

- **Seeded rules** take their ID from their key in your definitions, so the next seed finds the same
  rule and marks a runtime edit as an override.
- **Runtime rules** get a slug built from the tool and the destination with a short random suffix,
  such as `mail-send-sam-k3f9`.
- **A deleted rule's ID** is never reused, so an old record never points at a different rule.

**Why:** the last-fired record and your review of stale rules follow a rule across edits by its ID,
while the revision tells a replay exactly which version decided. An edit that changes what a rule is
for, such as a new tool, is a removal and an add, so the old rule's history ends visibly.

## The snapshot hash

Every record carries the hash of the definitions in force. nixie computes it as SHA-256 over a
canonical form of the whole definition set:

- **Persona and job instructions,** written in markdown, normalise to Unicode NFC with LF line
  endings, no byte order mark and exactly one final newline. Trailing spaces stay, because 2 of them
  are a markdown line break.
- **Jobs** sort by ID, with their schedule, their instructions' hash, their tool list, their skill
  list and their allowed destinations.
- **Skills** sort by name, each with the content hash of its folder and its provenance, under the
  [skills design](../skills.md#versions).
- **Policy** holds the rules sorted by ID, the complete tool declarations sorted by tool name, the
  budget limits, the IDs of known contacts, and the versioned checker definitions. A checker
  definition holds its prompt hash and the model and adapter settings that affect its verdict, so a
  changed checker changes the snapshot.
- **Objects** serialise as JSON with sorted keys and no whitespace, and every set-valued field sorts
  and drops duplicates.

In slice 1, the policy part of the form holds [the slice 1 rule](decision-point.md#the-slice-1-rule)
in canonical form, plus the test rule in a test build, and the complete tool declarations. Slice 1
has no seeded rules, budgets, contacts or checkers. The snapshot hash therefore changes only with
the persona or with a release that changes a tool declaration. **Why:** the fixed rule decides by a
tool's declared effects, so a replay needs the declarations in force.

The form leaves out state that changes without an edit: when a rule last fired, how much of a budget
is spent, and rule metadata. **Why:** the hash then changes exactly when the definitions do, and a
replay with the snapshot reproduces every deterministic decision. nixie keeps each snapshot under
its hash, with the definitions commit as a label. The persona, each job, each skill and the policy
each also have their own hash, so a task records the persona, job and skill versions it pinned
beside the snapshot of the policy in force.

## The widening check

nixie classifies each edit as narrowing, widening or unchanged, and only a narrowing applies at
once. An edit narrows when the new rule's match lies inside the old one's for an allow rule, or the
old one's lies inside the new one's for a deny or ask rule:

- Adding a deny or ask rule, and removing an allow rule, narrow.
- Adding an allow rule, and removing a deny or ask rule, widen.
- A stricter outcome over the same or a wider match narrows; a looser outcome widens.
- Within one outcome, the check compares field by field: a pattern inside another, a context list
  inside another, a check that implies another, a sooner expiry, and a lower lift cap on the same
  budget.

The check is conservative. When it cannot prove that one pattern lies inside another, it reports a
widening and nixie asks, so it never reports a widening as a narrowing. A set of edits applied
together narrows when each edit does. Effect declarations, budgets and known contacts follow the
same rule: adding an effect, lowering a budget and removing a known contact narrow, and their
opposites widen.

## Gaps and proposed rules

A prompt because no rule matched is a gap. nixie groups gaps by tool, context and destinations, and
the live view shows each group with its count and its approvals.

When you approve 3 calls of one group within 30 days and reject none, nixie proposes the narrowest
rule that covers all of them. Both numbers are defaults you can change. The proposed rule names the
tool, lists the destinations you approved, and keeps an `eq` check for each argument that held the
same value in every approval, leaving out free-text arguments. Creating it is a widening, so the
proposal joins the approval digest as an always-ask item, and you can edit it before approving. A
rejected proposal stays quiet for 30 days. **Why:** 3 identical approvals mark a habit and keep a
one-off from becoming a rule, and the rule covers only what you already approved.

## Mandates

A mandate is authority for a period, such as "full authority over my calendar invites today": one or
more ordinary rules that share a mandate ID and an expiry. You state it in the conversation or open
the mandate form, and nixie posts its rules as one always-ask proposal that shows each rule's
sentence and the time it ends. The expiry defaults to the end of your day, every mandate has one,
and a mandate that holds a lifting rule takes a lifting approval.

The client shows every active mandate with the time it has left, and one action ends it at once,
which narrows and so needs no prompt. The decision point checks the expiry against the call's time,
so a replay agrees. A timer then removes the rules with a record, and the conversation learns that
the mandate ended.

## The starter rule set

The starter rule set ships as a template in the definitions scaffold that you copy, never as rules
built into the public repo, because the principle "Behaviour is data" keeps policy out of the system
tier. It has 8 rules:

| Rule                        | Outcome | Matches                                               |
| --------------------------- | ------- | ----------------------------------------------------- |
| `allow-reads`               | Allow   | Effects `read` and `fetch`                            |
| `allow-notes`               | Allow   | Effect `note`                                         |
| `allow-service-writes`      | Allow   | Effect `write`, which the service can restore         |
| `allow-sends-within-limits` | Allow   | Effect `send`, still bound by the destination limits  |
| `allow-sandboxed-code`      | Allow   | Effect `code_run`                                     |
| `allow-narrowing`           | Allow   | Effects `policy_narrow` and `budget_lower`            |
| `ask-permanent-deletes`     | Ask     | Effect `delete`                                       |
| `ask-exports`               | Ask     | Effect `export`, such as a memory or event log export |

The always-ask set and the destination limits hold whatever the starter rules say, so the set is
permissive inside those bounds. An effect the set does not mention, such as `device`, falls to "no
rule matched" until you add a rule.

### Jobs

No starter rule allows creating a job. A job you ask for in a direct message runs through consent at
stage 8 with no prompt, and a job nobody asked for, such as one a task proposes, falls to "no rule
matched" and asks. A job carries its tools' effects, so one whose tools delete for good meets
`ask-permanent-deletes`, and one whose tools spend meets the always-ask set, both before consent.

Every job creation or change posts a notice however it was allowed: a line under nixie's reply, such
as "Scheduled: inbox triage, daily 7:00", with an undo action that removes the new job or restores
the old definition at once. The live view lists every job with its schedule, its tool list and the
record that created it. **Why:** a job acts long after the conversation that made it, so you see
each one when it starts and find all of them in one place.
