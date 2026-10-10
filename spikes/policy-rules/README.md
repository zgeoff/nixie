# Spike: the rule engine, the snapshot hash and the prompt scenarios

This spike prototypes the policy decision point from the
[policy design](../../docs/design/policy/decision-point.md) in TypeScript, with no dependency, and
runs it over sample tool calls, reordered definitions, rule edits and scripted scenarios. Every
sample call got exactly one decision, and none changed under 200 rule orders. The snapshot hash
stayed the same across 1,000 equivalent reorderings and moved on each of 18 real changes. The
widening check classified 26 of 27 rule edits correctly and erred only towards "widens". The
scripted scenarios raised 15 prompts against the starter rule set, none of them from a direct
request or a repeat.

## Questions

1. Does every tool call get exactly one decision, independent of rule order, and which calls fall
   through to "no rule matched"?
2. Is the snapshot hash stable across reordered but equivalent definitions, and does every real
   change move it?
3. Can code tell whether a rule edit widens access, using only the fixed checks from
   [decision 0004](../../docs/decisions/0004-rule-engine.md), without ever calling a widening a
   narrowing?
4. How many prompts do scripted scenarios raise against the starter rule set with auto-mode off, and
   from which of the causes in [decision 0005](../../docs/decisions/0005-effects-and-taint.md)?

## Versions

| Component | Version                                    |
| --------- | ------------------------------------------ |
| Bun       | 1.4.2                                      |
| Packages  | none; `node:crypto` for SHA-256 only       |
| Host      | Linux under WSL2, no network, no model run |

## Setup

[`engine.ts`](./engine.ts) holds the rule format, the decision pipeline, the canonical form, the
snapshot hash and the widening check. [`starter.ts`](./starter.ts) holds a sample tool registry of
27 tools with declared effects and destination arguments, and the starter rule set of 8 rules that
the design proposes. Each question has its own script:

- [`matcher.ts`](./matcher.ts) builds 108 calls, every tool in every context with sample arguments,
  and adds 4 rules that conflict with the starter set: a spending lift, a deny that overlaps an
  allow, a narrow ask and a narrow allow. It decides each call once, then again under 200 shuffled
  rule orders, and compares the decisions.
- [`hash.ts`](./hash.ts) hashes a definition set with a persona, 2 jobs, the starter policy and a
  rule with argument checks. It reorders rules, keys, list members and jobs, duplicates list members
  and argument checks as separate objects, writes a check value in decomposed Unicode, and rewrites
  the persona with a byte order mark, CRLF line endings and trailing blank lines, 1,000 ways. Then
  it makes 18 real changes, one at a time.
- [`widening.ts`](./widening.ts) classifies 27 rule edits: adds, removals, outcome changes, pattern
  changes, context limits, expiries, argument checks, lift caps and a CEL condition.
- [`scenarios.ts`](./scenarios.ts) runs 14 scripted scenarios. Each is a fixed sequence of tool
  calls with the owner's typed message and the owner's answer to any prompt; no model runs. The
  script records each prompt with its cause, applies "always allow" and accepted rule proposals as
  new rules, charges spending to a budget, and checks each step's outcome and cause against the
  script. It exits with status 1 when any step differs, so CI can run it.

The consent check is a stub. Its code half runs as designed: every destination, or a saved contact
name that resolves to it, appears word for word in the text the owner typed. Its model half reads a
flag in the script that says whether the owner asked for the action.

## How to run

```bash
cd spikes/policy-rules
bun run spike
STARTER=cautious bun scenarios.ts
```

The second command reruns the scenarios with a cautious starter set that drops the allow rules for
writes to the owner's services and for sends within the destination limits. The script's
expectations describe the starter set, so the cautious run reports its 6 extra prompts as differing
steps and exits with status 0.

## Output

### Question 1: one decision per call

```text
calls: 108, rule orders per call: 200
decisions that changed with rule order: 0
decisions by outcome and stage:
  allow/rules: 62
  ask/always_ask: 12
  ask/destinations: 9
  ask/no_match: 9
  ask/rules: 10
  deny/rules: 6
fell through to "no rule matched": 9
  home.lights in conversation
  home.lights in task
  home.lights in job
  job.create in conversation
  job.create in conversation
  job.create in task
  job.create in task
  job.create in job
  job.create in job
allow and deny both match mail.send to *.net: {"outcome":"deny","rule":"deny-mail-to-net","stage":"rules"}
```

Every call reached exactly one outcome, because the pipeline returns at its first deciding stage and
its last stage always decides. Rule order never mattered: within the rules, the strictest matching
outcome wins, and the record names the lowest rule ID among the matches of that outcome. 2 tools
fell through: a device control, whose effect the starter set does not mention, and creating a job
whose tools neither send nor delete, which no starter rule allows. The sample calls carry no owner
message, so consent never applies in this run.

### Question 2: snapshot hash stability

```text
equivalent reorderings that changed the hash: 0 of 1000
  persona word: hash changed
  persona hard line break: hash changed
  job schedule: hash changed
  rule outcome: hash changed
  rule expiry added: hash changed
  known contact added: hash changed
  effect declaration: hash changed
  budget limit: hash changed
  checker prompt: hash changed
  checker model: hash changed
  checker adapter: hash changed
  checker settings: hash changed
  checker removed: hash changed
  checker added: hash changed
  tool destination classification: hash changed
  tool amount classification: hash changed
  tool free-text classification: hash changed
  tool result source: hash changed
```

The canonical form sorts object keys, sorts and deduplicates every set-valued field by its canonical
value, sorts rules by ID and jobs by ID, and normalises markdown to NFC with LF line endings, no
byte order mark and one final newline. Strings serialise in NFC, and the matcher compares arguments
and rule values in NFC too, so 2 spellings of one string that the hash treats as equal always match
the same calls. It keeps trailing spaces inside a line, because 2 trailing spaces are a hard line
break in markdown, and the second change shows that the hash sees them.

The fixture includes consent, memory-assertion and retirement-intent checker definitions. Their
normalized prompt hashes, model and adapter identifiers, and verdict-affecting settings enter the
policy form. The reorder controls also reverse checker order and config-key order and change prompt
line endings. Every real checker change must move the hash, and the runner asserts that it does. It
calls no checker model and adopts no model or provider.

Tool declarations enter the hash in full, including destination, amount, free-text and result-source
classifications. Four controls change those declarations without changing the tool's effects; each
must still change the snapshot. Free-text argument lists normalize as sets, as destination lists do.

### Question 3: the widening check

```text
  CONSERVATIVE allow: glob *x* inside *: widens
cases: 27, narrowing called widening: 1, widening called narrowing: 0
```

The 26 other cases matched their expected class, among them every add and removal, outcome changes
in both directions, a loosened membership list, a raised lift cap, a switched budget and a CEL
condition, which always counts as widening. The one miss is a pattern with 2 wildcards inside
another pattern, which the check does not try to prove and so reports as widening; nixie then asks,
which costs a prompt and never access.

### Question 4: prompts in the scenarios

```text
find something on the web: 0 prompt(s)
find it and send it to an address the owner typed: 0 prompt(s)
find it and send it to a saved contact by name: 0 prompt(s)
triage an inbox as a job run, with one injected email: 1 prompt(s)
      mail.send: PROMPT outside_steering - injected forward
      calendar.invite: deny (scope) - tool not on the job list
book a table: 1 prompt(s)
      booking.reserve: PROMPT outside_steering
buy within a lifting rule: 2 prompt(s)
      shop.buy: PROMPT always_ask
      shop.buy: PROMPT always_ask - month budget spent
a tool no rule covers, then "always allow": 3 prompt(s)
a tool no rule covers, then the proposed rule: 4 prompt(s)
      gap: approved 3 times, nixie proposes a rule for home.lights
      rules.add: PROMPT always_ask - owner accepts the proposed rule from the digest
a direct request with no rule: 0 prompt(s)
morning report job: 0 prompt(s)
grant for a day: 2 prompt(s)
      rules.add: PROMPT always_ask
      calendar.invite: PROMPT outside_steering - grant expired
create a job that replies to email: 0 prompt(s)
      job.create: allow (consent)
      job.create: allow (consent) - the owner asked, so consent allows it
a job nobody asked for: 1 prompt(s)
      job.create: PROMPT no_rule - a task proposes a weekly reading digest
delete for good: 1 prompt(s)
      mail.purge: PROMPT ask_rule
prompts by cause:
  always_ask: 4
  ask_rule: 1
  no_rule: 7
  outside_steering: 3
defects (causes 1 and 2): 0
prompts where the destination came from search results: 1
steps that differed from the script's expectation: 0
```

The output above is trimmed to the prompts; `bun run spike` prints every step. Every prompt was one
the design intends:

- **Outside steering, 3.** The injected forward in the inbox job, a grant that had expired, and the
  booking, whose venue ID came from search results rather than from the owner's words.
- **The always-ask set, 4.** A purchase over the lift's per-action cap, a purchase past the month's
  budget, creating a day's grant, and accepting a proposed rule.
- **No rule matched, 7.** A device tool the starter set does not cover, until "always allow" or an
  accepted proposal added a rule; the proposal appeared after the third approval. One more came from
  a job that a task created with no request from the owner.
- **An owner's ask rule, 1.** A permanent delete. It fits none of the 5 causes from decision 0005;
  the script records it under the sixth cause that
  [decision 0028](../../docs/decisions/0028-policy-design.md) adds.

A job the owner asked for in the conversation ran with no prompt through consent, both a morning
summary and a job that replies to email.

The cautious starter set raised 21 prompts instead of 15. All 6 extra prompts came from the inbox
job, one per label, archive, trash, draft, reply and send to a known contact, so a job that runs
every 30 minutes would raise them on every run.

## What it left untested

- Real tools, a real model, and a real consent checker. The scenarios are scripted call sequences,
  so they test the rules and the pipeline, not whether a model makes those calls.
- auto-mode. Every grey-zone decision asked the owner, as nixie does with auto-mode off.
- Rule files on disk, seeding from a definitions repo, and the client forms that edit rules.
- Speed. A decision is a filter over a few dozen rules; no timing was taken.
- A widening check over a whole rule set at once. The check classifies one rule edit, and a set of
  edits is classified edit by edit, which is sound because the strictest outcome wins.
- CEL. A rule with a CEL condition never matches in the prototype, and its edits always count as
  widening.
