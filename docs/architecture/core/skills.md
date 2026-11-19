# Skills

A skill is a procedure from the user's [definitions](./definitions.md) in the Agent Skills format: a
folder with a `SKILL.md` and the files it refers to. A task keeps the skill versions it started
with, the conversation sees a catalog of its skills in the system prompt, and a skill grants
nothing, so every action it describes still passes [the decision point](../policy/decision-point.md)
as an ordinary tool call. `modules/skills` owns the pins, the catalog and the skill tools.

[The definitions](./definitions.md#skills) covers the checks [the seed](./definitions.md#seeding)
runs on each skill and how each version is kept. Each skill version lives under its skill hash, the
content hash of the skill's folder that the same section defines. The definitions in force are those
of the newest seed.

## Skill lists

Each task has a skill list beside its tool list. The conversation's list is the `skills` field of
the [definitions manifest](./definitions.md#the-definitions-format), or every skill when the field
is unset. Every other task has an empty list. A skill off a task's list stays out of its catalog.

## The pin

A task records the version of each skill on its list the first time it reads its skills. The pin is
a record on the task's [thread](./event-log.md#what-a-record-holds), and it holds each skill's name,
skill hash and whether the skill is [vendored](#vendored-skills). Every later read takes the newest
pin on the thread, so a seed that changes a skill leaves a running task on the version it pinned. A
skill version stays in the database after a seed replaces it, so a pinned version stays readable.
Before the first seed, a task has no skills and records no pin.

The conversation is one long task, so its pin holds until a reload tool moves it on, as
[the skill tools](#the-skill-tools) describes. Each conversation [step](./tasks.md#steps) reads the
pin as it begins, and the turn and the compaction request render the same catalog. A persona change
leaves the pin alone: the next step reads the persona in force and opens a new session on the same
pin.

## The catalog

The system prompt holds the catalog right after the persona: a short head on how to use a skill,
then one line per pinned skill with its name and description, in name order. A task with no skills
gets no catalog.

The catalog has a cap in tokens. The harness of the conversation's
[model profile](./model-profiles.md#harnesses) reports the context window, and the cap is a share of
that window, which the `skills` section of the
[deployment configuration](../deployment/configuration.md) sets. Past the cap, the server lists the
remaining skills by name alone, so the model still knows each one exists. The server never drops a
name, so a names-only catalog that is longer than the cap stays whole and goes past it. A larger
share, or a profile with a larger window, raises the cap, so more skills keep their descriptions
with no change to the pin.

The catalog changes only when the pin moves or when a restart changes its cap, so the
[prompt cache](../memory/context.md) holds from turn to turn between those changes.

## The skill tools

The conversation's tool endpoint serves five skill tools. It serves a sixth, `skill_vendor`, when
the deployment exports to a definitions repo, as
[the export](./definitions.md#the-export-to-the-definitions-repo) describes. `skill_read`,
`skill_reload` and `skill_reload_all` act only on a skill that the calling task's list or pin holds,
so they read no skill for a task other than the conversation.

The Effect column gives the effect each tool declares, which rules match on, as
[effects and declarations](../policy/decision-point.md#effects-and-declarations) describes.

| Tool               | Effect  | Returns                                                      |
| ------------------ | ------- | ------------------------------------------------------------ |
| `skill_read`       | `read`  | The pinned version's instructions and file list, or one file |
| `skill_reload`     | `note`  | The named skill's old and new version                        |
| `skill_reload_all` | `note`  | The old and new version of each skill on the list or the pin |
| `skill_write`      | `note`  | Applied, or the proposal's short ID, pending approval        |
| `skill_pending`    | `read`  | Each skill proposal that waits for the user's answer         |
| `skill_vendor`     | `fetch` | The URL of the pull request that adds a published skill      |

`skill_read` serves the pinned version. Without a path, it returns the instructions without their
frontmatter and the paths of the skill's other files. With a path, it returns that one file, and it
refuses a path that leaves the skill's folder. Every field it returns from a skill's text is
untrusted, because a vendored skill is someone else's text.

A reload takes a fresh snapshot from the [definitions source](./definitions.md#sources) and
[seeds](./definitions.md#seeding) it when the source's revision is new. The reload then moves the
task to the versions in force and writes a reload record on the task's thread, which holds the new
pin and each skill's old and new version. The server runs one seed at a time, so a reload and the
[definitions poll](./definitions.md#sources) never commit an older revision after a newer one.
Reloads on one thread run one at a time too, so each one plans from the pin the one before it wrote.
A skill that left the task's list or the definitions leaves the pin, and a skill that joined the
list joins it.

The next turn's catalog renders the new pin. The server names each skill the reload changed in that
turn's [events block](./conversation-turns.md#the-events-block), and tells the model to read the
skill again, because a body the model read before the reload stays in its context.

## Skills that nixie writes

`skill_write` takes a skill's name and its complete set of files, for a new skill or a new version
of one. The tool checks the folder against:

- [the checks the seed runs](./definitions.md#skills);
- a path that leaves the folder;
- the size limits of a snapshot.

A skill that fails a folder check returns every problem as an error.

`skill_write` also reads the skill's base: the version in force that the write would replace, or
none for a new skill. Then it runs the token check of the memory content gate on the files, which
[the token check](../memory/writes.md#the-token-check) covers. The check succeeds when every
destination-like token in the files appears in the persona, in a skill in force, or in what the user
typed on the thread within the gate's [evidence window](../memory/writes.md#the-content-gate).

A skill that passes the folder checks either applies at once, as
[writes under a rule](#writes-under-a-rule) describes, or becomes a proposal. The server writes the
proposal as a record on the calling task's thread. The record holds the files, the base, the first
token that failed the token check, and the task run and the tool call that wrote it, so the review
shows a destination the user never named. The model reads the proposal by its
[short ID](./database.md#short-ids).

### The review of a proposal

The user reviews a proposal through the skill host commands, which
[host commands](../deployment/host-commands.md#memory) lists. The commands show each pending
proposal with its files, the version of the skill in force at the time of the listing, and the
outcome of the token check, so a diff of each file against the version in force shows what the
proposal changes. The user gives the proposal and its skill hash in each answer.

The server refuses an answer when the diff the user read no longer shows what the answer changes:

- an answer under another skill hash;
- an answer to a proposal that an answer or a lapse closed;
- an answer to a proposal whose base is no longer the version in force.

The server records nothing for a refused answer, and the listing shows a proposal whose base moved
as stale. The server closes a proposal with a record on the thread of the task that wrote it:

- **Approval.** The record names the user as approver. In the same transaction, the server runs the
  seed checks on the files again and stores the skill in
  [the store of written skills](./definitions.md#skills-that-nixie-wrote), under a new ID in its
  `approval_id` column. The server then runs a seed of the definitions in force, which puts the
  skill in force for the next task. The user may approve edited files in place of the proposal's,
  and the record notes that they are edited. nixie then
  [exports the skill](./definitions.md#the-export-to-the-definitions-repo) to the user's definitions
  repo as a pull request.
- **Rejection.** The record holds the user's reason in its [erasable fields](./erasable-fields.md).
- **Lapse.** A proposal with no answer lapses at its lapse time, a fixed time after the proposal,
  which [the shared row](../policy/approvals.md#the-shared-row) holds. An hourly sweep records each
  lapse, and the listing leaves out a proposal past its lapse time before the sweep reaches it.

A proposal moves once, from pending to approved, rejected or lapsed. `modules/proposals` holds those
moves, the lapse time and the sweep for any kind of proposal, and `modules/skills` gives it the
records that each skill proposal's move reads and writes.

`skill_pending` lists the pending proposals to the model, oldest first, so the model knows what it
proposed after a compaction drops the turn it proposed in, and never proposes a skill that already
waits. Each entry gives the proposal's short ID, the skill's name, whether it is a new skill or a
new version and the version it replaces, and its age. The tool lists and never answers, because only
the user approves or rejects a proposal. The model wrote each name, so the result counts as
untrusted, as `memory.pending` does in [the memory store](../memory/store.md#the-models-tools).

In the conversation's next turn, the server names each of its proposals that closed, with the reason
for a rejection, so the model learns why the user turned a skill down. For an approval, the server
tells the model to reload the skill, because the conversation's pin holds the versions it started
with.

### Writes under a rule

A write applies at once when an allow rule of the user's that matched the call lists `skill_write`
by its exact name in its [`tools` field](../policy/rules.md#the-rule-format). The server never
applies a write under a tool pattern, such as `skill_*` or `*`, so a write applies only when the
user named the tool. An edit that adds the name to an allow rule is a widening, which waits for the
user's approval, as [the widening check](../policy/rules.md#the-widening-check) explains. A rule of
a [mandate](../policy/rules.md#mandates) counts the same way. The decision point passes the tool
every matched allow rule that lists it. When several do, the tool records the one with the lowest
rule ID.

A write that passes the folder checks becomes a proposal, and never applies, in each of these cases:

- The matched allow rules leave `skill_write` unnamed, such as when only the `allow-notes` rule of
  the [starter rules](../../../deploy/compose/definitions/rules/starter.yaml) matches the `note`
  effect.
- The token check fails. The check runs under every rule, because the worst skill nixie could write
  is one that sends future tasks to a destination the user never named.
- Another write changed the skill after the tool read the base and before the write applies, so
  applying would replace a version the model never saw.

To apply a write, the server stores the skill in
[the store of written skills](./definitions.md#skills-that-nixie-wrote) and writes a
`skills.write_applied` record on the calling task's thread, in one transaction. The stored row gets
a new ID in its `approval_id` column, as an approved proposal's row does, and the record holds the
rule and its revision in place of an approver. The server then runs a seed of the definitions in
force, which puts the skill in force for the next task, and nixie
[exports the skill](./definitions.md#the-export-to-the-definitions-repo) to the user's definitions
repo as a pull request.

The tool returns `applied`, with a message that tells the model to reload the skill. The
conversation shows a notice with the skill's name, the first 12 characters of its skill hash, and
the rule's ID. nixie never reverts a written skill, so the notice offers no undo.

## Vendored skills

`skill_vendor` copies a published skill from a public GitHub repository into the user's definitions
repo as a pull request, and the user's merge is the review: a task reads the skill only after the
merge and the next seed. The model passes the repository URL, the path of the skill's folder and a
full commit SHA in the call. The tool refuses a branch, a tag or a short SHA before it fetches
anything, because only a full SHA pins content that cannot move.

The tool reads the commit, walks its trees to the folder and reads each file through a
[fetch sandbox](../connectors/web-fetch.md#the-fetch-sandbox) of its own. That sandbox keeps the
public-address checks of the web fetch, and allows a file up to the definitions size limit. The tool
declares `fetch`, with the repository as its destination. Each file's text must hash to the git blob
hash that the commit's tree lists, so the text nixie reads is the commit's exact bytes, and a file
that is not plain UTF-8 text fails the call. The pull request holds that text with one change: CRLF
line endings become LF, as the definitions hash expects. A path with a part that starts with a dot
stays out, because the definitions source never reads one.

The tool then runs [the checks the seed runs](./definitions.md#skills) on the folder, with CRLF line
endings turned to LF, and a skill that fails one returns every problem as an error. A skill that
passes becomes a pull request through the same repository writer as
[the export](./definitions.md#the-export-to-the-definitions-repo), on a branch of its own per skill.
The pull request holds the files under the skill's folder, and removes the files of a vendored
version it replaces. It also writes the skill's lock entry in `skills/skills.lock.json`, which
[the definitions](./definitions.md#skills) describes, with the skill hash the seed recomputes. The
tool refuses to replace a skill of the user's own, one with no lock entry.

The pull request body holds a review report that the tool builds from the files:

- each destination-like token, by the token check that `skill_write` runs, with the file and line
  where it appears
- each line that installs a package or reaches the network, such as `pip install` or `curl`
- the skill's `allowed-tools` and `compatibility` fields, which nixie never grants
- the commit's signature, when the publisher signed it, as GitHub verified it or with the reason it
  failed
- the paths the copy left out

The tool keeps the report under the size GitHub allows for a pull request body. It shortens a long
value, caps each list and counts what it leaves out, and when the report still runs over, it cuts at
a line end and adds a note.

A call may ask for an advisory review. The model of the checker role in the
[role map](./model-profiles.md#the-role-map) then reads the files as data and returns a verdict and
a reason, and the tool shows them in the report under their own heading. Only the user's merge
approves the skill, whatever the verdict. On a deployment with no checker, the tool refuses a call
that asks for one.
