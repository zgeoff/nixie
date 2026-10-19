# Skills

A skill is a procedure from the user's definitions in the Agent Skills format: a folder with a
`SKILL.md` and the files it refers to. A task keeps the skill versions it started with, the
conversation sees a catalog of its skills in the system prompt, and a skill grants nothing, so every
action it describes still passes the decision point as an ordinary tool call. `modules/skills` owns
the pins and the catalog, under [0038](../../decisions/0038-skills.md).
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

The conversation is one long task, so it keeps the versions of its first pin. Each conversation step
reads the pin as it begins, and the turn and the compaction request render the same catalog. A
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
