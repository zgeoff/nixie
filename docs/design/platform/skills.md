# Skills

- Decisions: [0013](../../decisions/0013-definition-versioning.md),
  [0020](../../decisions/0020-deployment.md),
  [0022](../../decisions/0022-coding-and-code-execution.md), [0038](../../decisions/0038-skills.md)

A skill is a procedure in the [Agent Skills format](https://agentskills.io/specification): a folder
with a `SKILL.md` file, reference files and scripts. Skills come from your definitions, stay fixed
for the life of a task unless a reload moves it on, and reach the model through a catalog in the
prompt and the `skill_read` tool. A skill's scripts run through the code tool. A skill grants
nothing, so every action a skill describes still passes through policy as an ordinary tool call.

## A skill in the definitions

A skill lives at `skills/<name>/` in the definitions repo:

```text
skills/
  skills.lock.json
  pdf-forms/
    SKILL.md
    references/field-types.md
    scripts/fill.py
```

`SKILL.md` opens with YAML frontmatter, as the format sets out. nixie reads these fields:

| Field           | Use in nixie                                                    |
| --------------- | --------------------------------------------------------------- |
| `name`          | The skill's ID, which matches its folder name                   |
| `description`   | The catalog line the model chooses by, at most 1,024 characters |
| `compatibility` | Shown at review and in the client, as what the skill expects    |
| `allowed-tools` | Shown as the tools the skill expects, and never granted         |
| `metadata`      | Kept with the skill and shown in the client                     |

The seed refuses a skill whose frontmatter fails the format's rules, or whose name differs from its
folder name.

### The definitions filter under `skills/`

The [definitions source](connectors/definitions-source.md) filter admits every UTF-8 text file under
`skills/`, whatever its extension, and keeps its other rules: no dot paths, no symlinks from outside
the root, and the size limits. A file that fails to decode as UTF-8 fails the snapshot with its
path. **Why:** scripts such as `fill.py` come with their skill, and a binary file is one a review
cannot read.

### Vendored skills

`skills.lock.json` holds one entry for each vendored skill:

```json
{
  "pdf-forms": {
    "source": "https://github.com/example/skills",
    "path": "skills/pdf-forms",
    "commit": "<full-commit-sha>",
    "contentHash": "<sha256-of-the-skill-folder>"
  }
}
```

`contentHash` uses the definitions content hash over the files of that one folder. The seed
recomputes it and refuses a snapshot in which a vendored skill differs from its entry, with the
skill's paths. A skill with no lock entry is yours.

You vendor a skill by hand in a checkout of the definitions repo:

1. Copy the skill's folder at a full commit SHA into `skills/<name>/`, with LF line endings.
2. Compute its content hash from inside the folder:

   ```bash
   cd skills/<name>
   { printf 'nixie-definitions-v1\n'
     find . -type f ! -path '*/.*' | sed 's|^\./||' | LC_ALL=C sort | while IFS= read -r f; do
       printf '%s\t%s\t%s\n' "$f" "$(wc -c < "$f" | tr -d ' ')" "$(sha256sum "$f" | cut -d' ' -f1)"
     done; } | sha256sum | cut -d' ' -f1
   ```

3. Add the lock entry with the URL, the path, the commit and the hash.
4. Review the skill in the pull request before you merge it. Read its scripts for commands that
   install a package or reach the network, and its text for URLs and addresses.

nixie requires no publisher signature. The pin and your review of the pull request stand in for one.

### The checks at the seed

The seed refuses a snapshot when any skill fails one of these checks, run in code:

1. The frontmatter is valid, and the name matches the folder.
2. Every file is UTF-8 text within the size limits.
3. No file holds an invisible or bidirectional Unicode control character, such as a tag character or
   a right-to-left override. **Why:** they have no use in a skill and hide instructions from a
   reader.
4. A vendored skill matches its lock entry.

A new or changed skill that passes applies with a notice in the live view. **Why:** a skill widens
nothing, so the widening confirmation from [0020](../../decisions/0020-deployment.md) does not
apply.

## Versions

Each skill has a content hash over its folder. The
[snapshot hash](policy/rules.md#the-snapshot-hash) covers every skill, and a task records the hash
of each skill on its list when it starts, beside its persona and job versions. Every `skill_read`
and every code run serves the task's pinned version.

`skill_reload` and `skill_reload_all` move a running task on. Each one takes a fresh snapshot, seeds
it when its revision is new, and moves the task to the skill versions then in force: one named skill
for `skill_reload`, the whole list for `skill_reload_all`. The tool's record holds each skill's old
and new hash. On the next turn, the catalog in the system prompt holds the new versions, and a
change note before your message names the skills that changed, as the
[pinned core](memory/context.md#the-pinned-core) does. A body that the model loaded before the
reload stays in its context until the model reads the skill again, and the record of each read shows
which version it got.

## Skill lists

Each caller has a skill list beside its tool list:

| Caller           | Skill list                                                 |
| ---------------- | ---------------------------------------------------------- |
| The conversation | The `skills` list in the definitions, or every skill unset |
| A job run        | The job's `skills` field, and none when it is unset        |
| A worker run     | The subset its caller passes, within the caller's list     |

A skill off the list stays out of the catalog, and `skill_read`, both reload tools and the code tool
refuse it with an error. Every skill tool takes the skill name as an argument, so a rule can deny
one skill in a context, such as one job.

## The tools

| Tool               | Effect | Input                          | Result                                         |
| ------------------ | ------ | ------------------------------ | ---------------------------------------------- |
| `skill_read`       | `read` | A skill name, an optional path | The `SKILL.md` body, or the file at that path  |
| `skill_reload`     | `note` | A skill name                   | The skill's old and new hash                   |
| `skill_reload_all` | `note` | None                           | The old and new hash of each skill on the list |
| `skill_write`      | `note` | A skill name and its files     | Applied, or "pending approval as <id>"         |

`skill_read` without a path returns the body of `SKILL.md`, without its frontmatter, and the list of
the skill's other files. A path outside the skill's folder fails. A result field from a vendored
skill or a nixie-written skill carries that skill as its source, and a result from your own skill
carries your definitions.

## No skill from the SDK

Every model loop sets `skills: []`, `verbatimPrompts: true` and the setting
`disableBundledSkills: true`, beside `settingSources: []` and `tools: []`. **Why:** the
[skills spike](spikes/sdk-skills/README.md) found that, even with `skills: []`, a prompt starting
with `/` runs one of the CLI's bundled skills or built-in commands, such as `/clear`, before nixie's
policy sees it. `verbatimPrompts` delivers every prompt as written, and `disableBundledSkills`
removes the bundled skills from the session.

## The catalog

The system prompt holds the catalog, after the persona: one line per skill on the caller's list,
with its name and description, in name order. The catalog changes only when a task starts or
reloads, so the [prompt cache](memory/context.md#the-prompt) holds. The catalog has a size cap, 2%
of the model's context window by default and set in the
[deployment configuration](deployment/configuration.md). Past the cap, the catalog lists the names
of the remaining skills without descriptions, and the live view flags it.

## Scripts

The code tool from the [coding design](connectors/coding.md#the-code-tool) takes a `skills` list.
Before the program starts, nixie places each named skill's folder at the task's pinned version,
read-only, at `/skills/<name>/` in the code run's sandbox. The program calls a script by its path:

```bash
python /skills/pdf-forms/scripts/fill.py input.pdf
```

The code run keeps everything else from the code tool: the sandbox from its caller, the `run_code`
effect, the limits and its result as outside content. The skill files count towards the code tool's
input size. The code tool's record holds each skill's hash. A rule can match the `skills` argument,
such as "ask before a script from a vendored skill runs".

A code run has no network, so a script uses only what the code image holds, under
[0030](../../decisions/0030-connectors-and-sandbox-environments.md). A script that needs a missing
package fails, and its `compatibility` field shows what it expects.

## Skills that nixie writes

`skill_write` takes a skill name and its complete set of files, for a new skill or a change to one.
The seed checks run first, and a skill that fails one returns the failure as an error.

By default, the call becomes a proposal in the approval digest that shows every file as a diff
against the current version. An allow rule of yours whose tool field names `skill_write` applies the
skill at once, with a notice and undo, in the contexts the rule names, such as the conversation but
not job runs. A rule that matches the `note` effect alone, such as the starter `allow-notes`, lets
the call run and keeps the proposal. No starter rule names `skill_write`, and creating a rule that
names it is a widening that asks once.

One check runs whatever the rule says. Every destination-like token in the skill, by the
[token check](memory/writes.md#the-content-gate) that memory writes use, appears word for word in
text you typed or in your definitions, and a skill that fails it becomes a proposal. **Why:** the
worst skill nixie could write is one that sends future tasks to a destination you never named.

An applied skill holds the ID of the approval or rule that applied it. nixie then exports it to the
definitions repo as a pull request, as [rule export](../../decisions/0020-deployment.md#seeding)
works, and the next seed after your merge marks it as yours. A seed that changes a nixie-written
skill before the export merges shows the conflict in the client to resolve.

## What the first build leaves out

- Binary assets in a skill, such as templates and images.
- A tool that vendors a skill: nixie fetches a skill at a pinned commit and opens a pull request on
  the definitions repo with the lock entry and a review report.
- Skills in coding sessions: a coding adapter owns its harness, and atc manages its own skills.
- Per-job-run taint from a skill's provenance, which waits for the later stage of
  [0015](../../decisions/0015-taint-scope.md).
