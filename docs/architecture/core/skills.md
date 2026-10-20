# Skills

A skill is a procedure from the user's definitions in the Agent Skills format: a folder with a
`SKILL.md` and the files it refers to. A task keeps the skill versions it started with, the
conversation sees a catalog of its skills in the system prompt, and a skill grants nothing, so every
action it describes still passes the decision point as an ordinary tool call. `modules/skills` owns
the pins, the catalog and the skill tools, under [0038](../../decisions/0038-skills.md).
[The definitions](./definitions.md#skills) covers the checks the seed runs on each skill and how
each version is kept.

## Skill lists

Each caller has a skill list beside its tool list. The conversation's list is the `skills` field of
the definitions manifest, or every skill when the field is unset. A skill off a caller's list stays
out of its catalog.

## The pin

A task records the version of each skill on its list the first time it reads its skills: a pin
record on the task's thread holds each skill's name, content hash and whether it is vendored. Every
later read takes the newest pin on the thread, so a seed that changes a skill leaves a running task
on the version it pinned. A skill version stays in the database after a seed replaces it, so a
pinned version stays readable. Before the first seed, a task has no skills and records no pin.

The conversation is one long task, so its pin holds until a reload moves it on. Each conversation
step reads the pin as it begins, and the turn and the compaction request render the same catalog. A
persona change works differently: the next step reads the persona in force and opens a new session,
and the skill pin stays as it was.

## The catalog

The system prompt holds the catalog right after the persona: a short head on how to use a skill,
then one line per pinned skill with its name and description, in name order. The catalog changes
when the pin moves or when a restart changes its cap, and the [prompt cache](../memory/context.md)
holds from turn to turn between those changes. A task with no skills gets no catalog.

The catalog has a cap: a share of the context window that the conversation's CLI works in, which the
deployment configuration's `skills` section sets. A larger share or a model profile with a larger
window can bring back descriptions with no change to the pin. Past the cap, the catalog lists the
remaining skills by name alone, so the model still knows each one exists. The catalog never drops a
name, so a names-only catalog that is longer than the cap stays whole and goes past it.

## The skill tools

The conversation's tool endpoint serves five skill tools. Each of the three that read or reload acts
only on a skill that the caller's list or the task's pin holds. A run other than the conversation
has an empty skill list on that endpoint, so it reads no skill.

| Tool               | Effect | Returns                                                      |
| ------------------ | ------ | ------------------------------------------------------------ |
| `skill_read`       | `read` | The pinned version's instructions and file list, or one file |
| `skill_reload`     | `note` | The named skill's old and new version                        |
| `skill_reload_all` | `note` | The old and new version of each skill on the list or the pin |
| `skill_write`      | `note` | The proposal's short ID, pending approval                    |
| `skill_pending`    | `read` | Each skill proposal that waits for the user's answer         |

`skill_read` serves the pinned version. Without a path, it returns the instructions without their
frontmatter and the paths of the skill's other files. With a path, it returns that one file, and it
refuses a path that leaves the skill's folder. Every field it returns from a skill's text is
untrusted, because a vendored skill is someone else's text.

A reload takes a fresh snapshot from the definitions source and seeds it when its revision is new.
The reload then moves the task to the versions in force and writes a reload record on the task's
thread, which holds the new pin and each skill's old and new version. The server runs one seed at a
time, so a reload and the definitions poll never commit an older revision after a newer one. Reloads
on one thread run one at a time too, so each one plans from the pin the one before it wrote. A skill
that left the caller's list or the definitions leaves the pin, and a skill that joined the list
joins it.

The next turn's catalog renders the new pin. The turn's events note names each skill the reload
changed and tells the model to read the skill again, because a body it read before the reload stays
in its context.

## Skills that nixie writes

`skill_write` takes a skill's name and its complete set of files, for a new skill or a new version
of one. It runs [the checks the seed runs](./definitions.md#skills) on the folder, plus each path
inside the folder and the size limits a snapshot keeps to, and a skill that fails a check returns
every problem as an error. A skill that passes becomes a proposal record on the caller's thread,
which holds the files, the version in force it would replace, the run and the call that wrote it,
and the outcome of the token check. The model reads the proposal by its short ID.

The token check is the one that memory writes run under an allow rule, in
[the content gate](../memory/writes.md#the-content-gate): every destination-like token in the files
appears in what the user typed in their latest messages on the thread, or in the persona or a skill
in force. The proposal records the first token that fails, so the review shows a destination the
user never named.

The user reviews a proposal through the skill host commands, which list each pending proposal with
its files, the version of the skill in force at the time of the listing, and the outcome of the
token check, so a diff of each file against the version in force shows what the proposal changes. An
answer names the proposal and its skill hash, and the server refuses an answer under another hash,
or to a proposal that an answer or a lapse closed, and records nothing. A record of the answer
closes the proposal on the thread that wrote it:

- An approval names the pull request on the definitions source that carries the skill. The skill
  runs only once that pull request merges and a seed brings it in, so the approval itself changes no
  definitions in force.
- A rejection holds the user's reason in its erasable fields.
- A proposal that waits past its lapse time with no answer lapses. An hourly sweep records each
  lapse, and the listing leaves out a proposal past its lapse time before the sweep reaches it.

`skill_pending` lists the pending proposals to the model, oldest first, so the model knows what it
proposed after a compaction drops the turn it proposed in, and never proposes a skill that already
waits. Each entry gives the proposal's short ID, the skill's name, whether it is a new skill or a
new version and the version it replaces, and its age. The tool lists and never answers, because only
the user approves or rejects a proposal. The model wrote each name, so the result counts as
untrusted, as `memory.pending` does in [the memory store](../memory/store.md#the-models-tools).

The conversation's next turn names each of its proposals that closed, with the pull request of an
approval and the reason for a rejection, so the model learns why the user turned a skill down.
