# Versioning persona, jobs and policy

Report: 2.4

Sources were fetched on 2026-10-08 unless a different date is given with the source.

Systems that replay decisions well store 2 things on every record: the ID of the rule that decided,
and an ID for the whole set of definitions loaded at the time. OPA logs the revision of every loaded
bundle with each decision, LaunchDarkly logs a flag's version with the rule that matched, and
Managed Agents pins a session to an agent version. Amazon Verified Permissions logs only the policy
ID, so an edited policy breaks replay. For nixie, the strongest fit is a content hash of the
canonical definition set, stored in a table of snapshots in the same database as the event log, so
replay never depends on a git host. A git commit can ride along as a label. This note covers how
definitions are versioned and stamped; the durable layer's own code versioning sits in the
[engine notes](../2.2-notes/engines.md).

## What has to be versioned

[Behaviour is data](../../brainstorm/1.3-principles.md) puts persona, jobs and policy in the
deployment, and [tier 2](../../brainstorm/1.4-requirements.md#tier-2) asks for the version in every
record. The definitions come from 2 writers:

- The owner edits files in the deployment repo: persona, job definitions and starter rules.
- nixie writes rules at runtime. An "always allow" approval becomes a rule under
  [decision 0006](../../decisions/0006-approval-record.md), and a narrowing change applies at once
  under [decision 0005](../../decisions/0005-effects-and-taint.md).

A replay needs both sets as they stood at the time, plus the inputs that
[decision 0008](../../decisions/0008-auto-mode.md) records for auto-mode. A runtime rule may never
reach a commit, so a version scheme keyed on git alone misses it.

## How others stamp records

| System                      | Identifier on each record                      | Where the old definition lives       | Replay                                           |
| --------------------------- | ---------------------------------------------- | ------------------------------------ | ------------------------------------------------ |
| OPA                         | `bundles[<name>].revision`, plus `decision_id` | The bundle, usually a git SHA        | Fetch the bundle at that revision, rerun `input` |
| LaunchDarkly                | flag `version` and `reason.ruleId`             | LaunchDarkly's flag history          | Read the flag at that version                    |
| Stripe                      | `api_version` on each Event                    | Stripe's API versions                | `data` renders once and never changes            |
| Managed Agents              | agent `id` and integer `version`               | `GET /v1/agents/{id}/versions`       | Pin a session to the version                     |
| Mastra Agent Editor         | `versionId` of an immutable snapshot           | The stored snapshot                  | Fetch by `versionId` or `versionNumber`          |
| Langfuse                    | prompt version, linked to the generation       | Langfuse's prompt history            | Fetch by version; labels move                    |
| Amazon Verified Permissions | `determiningPolicies[].policyId` only          | Nowhere: the store has no versions   | Not possible after an edit                       |
| SpiceDB                     | ZedToken                                       | The datastore, until garbage collect | Fails once the GC window passes                  |

Sources: [OPA bundles](https://www.openpolicyagent.org/docs/management-bundles),
[OPA decision logs](https://www.openpolicyagent.org/docs/management-decision-logs),
[LaunchDarkly export schema](https://launchdarkly.com/docs/integrations/data-export/schema-reference),
[Stripe versioning](https://docs.stripe.com/api/versioning),
[Stripe Event object](https://docs.stripe.com/api/events/object),
[Managed Agents agent setup](https://platform.claude.com/docs/en/managed-agents/agent-setup),
[Managed Agents sessions](https://platform.claude.com/docs/en/managed-agents/sessions),
[Mastra versioning](https://mastra.ai/reference/editor/versioning.md),
[Langfuse version control](https://langfuse.com/docs/prompt-management/features/prompt-version-control),
[Verified Permissions `IsAuthorized`](https://docs.aws.amazon.com/verifiedpermissions/latest/apireference/API_IsAuthorized.html),
[SpiceDB consistency](https://authzed.com/docs/spicedb/concepts/consistency).

The details that matter for nixie:

- OPA keeps one revision per bundle, and the manifest's `roots` say which part of the data each
  bundle owns. Older OPA releases logged a single top-level `revision` instead
  ([v0.11 docs](https://openpolicyagent.org/docs/v0.11.0/decision-logs)).
- LaunchDarkly pairs the version with `ruleId` and `ruleIndex` in the `reason` object. That pairing
  matches the rule ID that [decision 0004](../../decisions/0004-rule-engine.md) stores, plus the
  version nixie lacks.
- Managed Agents, under the beta header `managed-agents-2026-04-01`, raises an agent's integer
  `version` only when an update changes something. Passing `version` on update gives optimistic
  concurrency, and a mismatch returns 409. `agent_with_overrides` changes fields for one session
  without a new version, and the session returns the resolved configuration next to the base ID and
  version.
- Mastra serialises a code-backed agent's overrides as deterministic JSON at
  `<codePath>/agents/<id>.json`, so git commits serve as its read-only versions.
- OpenAI's reusable prompts, `prompt: {id, version}`, are winding down: `v1/prompts` shuts down on
  2026-11-30, and OpenAI advises keeping prompts in code
  ([prompting guide](https://developers.openai.com/api/docs/guides/prompting)).
- SpiceDB's `at_exact_snapshot` fails with "Snapshot Expired" after `--datastore-gc-window`, so a
  token that points into live storage cannot serve a long-term audit.

## Choosing the snapshot ID

3 candidates can identify the definitions in force: a git commit, a content hash, and a counter per
definition.

A git commit or tree hash is free when every definition is a committed file. Git's object ID hashes
the type, size and content, so the same tree always gives the same hash
([Git internals](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)). It fails nixie in 2
places: runtime rules that nixie writes are not commits, and replay depends on the repo and its host
surviving, which [the data notes](data-and-storage.md) treat as a third party's copy.

A content hash of the parsed definitions survives both. RFC 8785, the JSON Canonicalization Scheme
(JCS) of June 2020, sorts keys and fixes number formatting, so a hash of the canonical form ignores
whitespace and key order ([RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)). Hashing each
definition, and then the set over its members' hashes, gives a Merkle-style ID: an unchanged rule
keeps its hash across snapshots. Unison applies the same idea to code: a definition is its hash, and
"Names are just separately stored metadata"
([Unison](https://www.unison-lang.org/docs/the-big-idea/)).

A counter per definition, as Managed Agents and LaunchDarkly keep, reads well to the owner. A record
then needs a tuple of versions, one per definition, which the set hash replaces with one value.

A table of definitions in force over a time range returns what applied at a given time. Postgres 18
supports `WITHOUT OVERLAPS` keys over range types, which stop 2 versions overlapping
([Neon on Postgres 18](https://neon.com/postgresql/postgresql-18/temporal-constraints)). Postgres 19
beta 4 reverted `FOR PORTION OF`, so range splits stay manual
([19beta4 notes](https://www.postgresql.org/message-id/attachment/204404/19beta4.md)). XTDB v2 keeps
valid time and system time on every row ([XTDB](https://docs.xtdb.com/about/time-in-xtdb.html)). A
stamped hash on each record makes this table unnecessary for replay, and keeps it optional for owner
queries.

## Schema versions

Axon stores each event's type name and a schema revision, and a chain of upcasters converts old
payloads on read without rewriting history
([Axon event versioning](https://docs.axoniq.io/axon-framework-reference/4.11/events/event-versioning/)).
That stamp versions the shape of a record, not the definitions behind a decision. nixie needs both,
in separate columns.

## Replaying a model's decision

A deterministic decision replays from the snapshot and the recorded input. A model decision, such as
auto-mode's verdict or the model's own choice of tool, does not replay to the same output, because
model calls are not deterministic. For those, the record keeps the output as a fact, and replay
checks only the deterministic layers around it, as the principle
[Policy is deterministic](../../brainstorm/1.3-principles.md) states. The record still needs the
model ID and the auto-mode version, so a measurement can group decisions by them.

## Worth borrowing

- OPA's revision per bundle, logged with every decision.
- LaunchDarkly's pairing of a definition version with the ID of the rule that matched.
- Managed Agents' rule that an update with no change creates no version, and its optimistic
  concurrency on update.
- Stripe's practice of rendering a record once under a pinned version, so the record never needs
  re-rendering.
- RFC 8785 canonical JSON for a hash that ignores formatting.
- Unison's split between a definition's hash and its display name.

## Worth avoiding

- A decision record that holds only a policy ID, as Verified Permissions returns.
- A snapshot token that expires with storage garbage collection, such as SpiceDB's ZedToken.
- A version that lives only at a hosted service, such as OpenAI's reusable prompts, which shut down
  on 2026-11-30.
- Replay that depends on a git remote being reachable.

## Recommendations

The research recommends the following, for the owner to decide:

1. **Stamp every record with a snapshot hash.** Decisions, approvals, proposals and task steps each
   store the hash of the definition set in force, next to the rule ID from 0004. The trade-off is
   one hash column on every row and a canonical form nixie must keep stable.
2. **Keep snapshots in the event log's database.** A `definition_snapshots` table, keyed by hash,
   holds the canonical JSON of each definition once, and a snapshot row lists its members' hashes.
   Replay then needs only the database and its backup. The cost is a second copy of definitions that
   also sit in the deployment repo.
3. **Record the git commit as a label.** When the deployment repo's definitions load, the snapshot
   records the commit they came from, so the owner can open the file history. Runtime rules carry
   the approval ID that created them instead.
4. **Snapshot on change, not per record.** nixie computes a new snapshot when the deployment loads
   or a rule changes, and every record until the next change shares its hash. A rule change and the
   snapshot it creates commit in one transaction with the decision that triggered it.
5. **Version memory separately.** Long-term memory changes on every reviewed write. Folding it into
   the definition snapshot would create a snapshot per memory write, so a record that a recalled
   memory influenced can instead store the memory item's own version, as
   [the memory notes](memory-models.md) raise.
6. **Stamp model decisions with their model and auto-mode versions**, and keep their output, since
   they cannot replay.

## Open questions

- Which canonical form covers persona text and job definitions written as markdown? JCS covers JSON;
  markdown needs a rule such as hashing the file bytes after line-ending normalisation.
- Does a rule's ID stay fixed across edits, with its hash changing, or does each edit mint a new ID?
  Unison's split suggests a stable name over changing hashes, and 0006's record of when a rule last
  fired needs the name to stay fixed.
- How long does nixie keep old snapshots? Deletion breaks replay of the records that point at them,
  which the [data notes](data-and-storage.md#deletion-and-the-append-only-log) weigh against
  erasure.
- Does a running task pick up a new snapshot at its next step, or keep the one it started with?
  Managed Agents pins a session to a version; nixie could pin a task the same way, or let narrowing
  rules apply at once.
