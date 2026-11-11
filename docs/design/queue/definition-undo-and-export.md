# Undo of a runtime change, and its export to the definitions repo

A runtime change of a task definition ends in one of 3 ways. You undo it, nixie retires it, or nixie
exports it to a pull request and adopts it after you merge. This doc covers both, because both
compare the same 2 things: the version that the runtime change holds and the version that the
definitions repo holds.

The sketches in `sketches/definitions/` hold the type shapes and the texts of the refusals and
notices that have a text. This doc holds the rules. An item marked `(open: <name>)` is not settled,
and [the open list](open/definitions.md) holds it. The [glossary](../../glossary.md) defines
definitions source, notice and record.

Terms from other docs:

- [Task definitions](task-definitions.md) defines task definition, definition hash, seed, seed
  record, manifest, snapshot form and in force.
- [The task of a definition](definition-tasks.md) defines erasable field.
- [Definitions from chat](definitions-from-chat.md) defines definitions repo, runtime change,
  runtime definition, previous version, head, define and undefine.
- [Schedules](schedules-and-triggers.md) defines one-shot.

Terms this doc adds:

- **Undo.** Your action that reverses one runtime change.
- **Base.** The version of a definition that the definitions repo held when the definition got its
  runtime layer: the first runtime change after a time with none in force. The base is null when the
  repo held no version. Only `--keep nixie` sets the base again.
- **Export.** One attempt to write the runtime changes in force to a branch of the definitions repo,
  and to open or update the pull request of that branch.
- **Adopt.** nixie adopts a runtime change when a seed finds that the repo holds the same definition
  hash. The runtime change then has the state `adopted`, and the repo's version is in force.
- **Retire.** nixie retires a runtime change when it puts the change out of force and no runtime
  change replaces it. The runtime change then has the state `retired`.
- **Conflict.** A runtime change has a conflict when the repo's version of its definition differs
  from the base and from the version of the runtime change.

## Built

The design uses this built code:

- The definitions export writes runtime changes of prompts, rules and skills to the definitions
  repo. It takes each kind of change as a `DefinitionsChangeKind`.
- The export writes through the port `DefinitionsRepo`. The GitHub adapter is its one provider.
- `canMoveDefinitionsExport` holds the allowed moves between the states of an export.
- The rules have one pull request that nixie updates in place, on the branch `nixie/rules`.
- When nixie closes a pull request, it sets the pull request to closed and deletes no branch.
- `nixie rules resolve <rule_id> --keep nixie|repo` resolves a conflict of a rule.

## The undo procedure

The procedure's input and output are in [`definitions.undo`](sketches/definitions/02-types.ts),
section M.

- `definitions.undo` is a procedure of the API. It is `signedIn`, and the contract lib defines it.
- The agent has no tool that calls the undo. Only you undo a runtime change.
- The procedure takes a change ID or a short ID. nixie resolves a short ID to its change ID first,
  and every comparison after that is between change IDs.
- An undo is itself a runtime change, with its own notice. The version it holds is the version that
  it restores.
- An undo of an undo follows the same rules as any undo.
- `undoDefinitionChange` runs the undo. It first runs a seed of the definitions source, outside the
  write transaction. It then opens one write transaction, reads the state of the definition and
  calls `pickDefinitionMove`.
- Inside that write transaction, `seedInForceInTransaction` runs a second seed, from the definitions
  in force. The rows below call it "the seed in the transaction".

## What an undo does

The same rows as code are in [the undo](sketches/definitions/03-flow.ts), section J.

`pickDefinitionMove` decides the undo from the state of the runtime change X that you name. The
first row that fits decides.

1. **X is not the head of its definition.** nixie refuses with `REPLACED`. The refusal returns the
   head: its change ID, its short ID and its operation.
2. **X is in force, and X replaced another runtime change.** nixie puts the previous version in
   force as a runtime definition. The base is the base of X.
3. **X is in force, X replaced no runtime change, and X has no conflict.** nixie puts the previous
   version in force. That version is the base. The seed in the transaction adopts the undo, so the
   definition has no runtime change in force.
4. **X is in force, X replaced no runtime change, and X has a conflict.** nixie puts the repo's
   version in force. The seed in the transaction adopts the undo. The result holds
   `restored: 'repo'` (open: undo output).
5. **X is adopted, and the repo holds the hash of X.** nixie puts the previous version in force as a
   runtime definition over the merged version. The next export writes the previous version to the
   repo. When the previous version is null, the export deletes the folder `tasks/<id>/`.
6. **X is adopted, and the repo holds another version.** nixie refuses with `REPO_MOVED`. The
   refusal gives the sequence of the seed record that found the other version.
7. **X is retired.** nixie refuses with `NOT_IN_FORCE` and the cause of the retirement:
   `one_shot_fired`, `one_shot_skipped` or `kept_repo`.

When a row from 2 to 5 picks a version to restore and that version is a one-shot, nixie checks 2
more refusals before it writes:

- When the repo holds the definition, nixie refuses with `ONE_SHOT_OVER_REPO`.
- When the time of the one-shot has passed, nixie refuses with `ONE_SHOT_PAST` (open: decider
  clock).

Other rules:

- In row 4, you edited the definition in the repo after the agent's change. The undo ends the
  agent's runtime change, and your edit is in force.
- nixie reads the `replaces` member of X to tell whether X replaced a runtime change. It does not
  compare hashes for that.

## A merge that races an undo

- You can merge the pull request of a runtime change and then undo that change before a seed has
  read the merge. The seed at the start of the undo reads the merge, and row 5 applies.
- When that seed fails, row 3 applies: nixie adopts the undo against the repo version it last read.
  The next seed reads the merge and puts the merged folder in force. The seed record shows that the
  folder came from the repo.
- Row 3 also applies when you merge after the undo and before the export closes the pull request.
- In both cases the merged version is in force at the end, and the undo has no lasting effect.

## The export

The same rules as code are in [the export](sketches/definitions/03-flow.ts), section K.

- The export of task definitions is one more `DefinitionsChangeKind`, beside prompts, rules and
  skills. `buildTaskChangeKind` builds it.
- The export uses the built export loop and the built `DefinitionsRepo` port unaltered. All
  GitHub-specific code is in the GitHub adapter.
- `branchOf` maps a definition ID to a branch. It returns `nixie/tasks` for every definition.
- All task definitions therefore share one pull request, which nixie updates in place. It is
  separate from the pull request of the rules, so a reminder does not wait for the review of a rule.
- A branch has one current export. It holds every runtime change in force that
  `isExportedDefinition` accepts.
- `isExportedDefinition` rejects a one-shot, so nixie never exports a one-shot.
- When no export is configured, nixie registers no change kind. A runtime change is then in force
  until you copy its files into the repo yourself.

## The export ID

- The export ID is a hash of 4 inputs: the branch; each runtime change with its base and the repo's
  version; the number of runtime changes of the branch that went out of force; and the snapshot hash
  of the last accepted seed.
- A define, an undefine, an undo, an adoption, a resolved conflict and a seed with another snapshot
  hash each alter an input. Each therefore makes an export with another ID.
- An export with another ID builds the branch again, on the newest commit of the base branch. That
  commit is the pinned commit of the export.
- An export that is not the current export of its branch closes.

## What an export writes

- For each runtime definition, the export writes the files to `tasks/<id>/`. It writes the stored
  text, so a restored version is the same byte for byte.
- The export deletes each file that the folder holds at the pinned commit and the runtime definition
  lacks.
- For an undefine, the export deletes every file of the folder.
- Before it writes, the export parses the repo's files with the runtime changes laid over them.
- The export fails and opens no pull request in 3 cases: a runtime definition does not parse; the
  repo's manifest is below format 4; or the runtime changes alter no file.
- nixie retries a failed export at each pass of the export loop.
- In the third case the repo holds the runtime changes as they are. The next seed adopts them, and
  the branch then has no current export.
- The current export of a branch updates the pull request of that branch.
- When a branch has no current export, nixie closes the open pull request of the branch. It does not
  alter a merged pull request.
- nixie closes the pull request on the branch that the export's row holds. When `branchOf` returns
  another branch than it did, nixie therefore closes the pull request of the old branch.
- When a write to the repo fails, the export's state is `exporting`, and nixie retries it.
- When the repo's answer to a write is lost, nixie finds the written branch by its name when it
  closes the export.
- The states of an export are `exporting`, `opened` and `closed`.

## Adoption and conflict

How nixie compares a runtime change with the repo is in
[the 2 layers](sketches/definitions/03-flow.ts), section L.

- After you merge the pull request, the next seed reads the merged files.
- At each seed, nixie compares each runtime change in force with the repo's version of its
  definition. It does one of 3 things:

1. **The repo holds the hash of the runtime change.** nixie adopts the runtime change. It writes
   `definition.settled` with the outcome `adopted`. A null hash on both sides counts as the same
   hash.
2. **The repo holds the base.** The runtime change is in force as before.
3. **The repo holds another version.** nixie writes `definition.repo_moved`. The runtime change has
   a conflict.

- nixie computes a conflict from 2 columns of the row in `runtime_task_definitions`. `base_hash` is
  the base. `definitions_hash` is the repo's version of the definition at the last seed. nixie
  stores no conflict flag.
- A runtime change with a conflict is in force. Its pull request is open, built on the repo's
  version, until you resolve the conflict.
- You resolve a conflict with a command of the nixie CLI. The command takes the definition ID and
  `--keep nixie` or `--keep repo` (open: resolve command).
- With `--keep nixie`, nixie sets the base to the repo's version. The conflict ends, and the runtime
  change is in force.
- With `--keep repo`, nixie retires the runtime change. The repo's version is in force when the
  transaction commits.
- nixie writes `definition.conflict_resolved` for either choice.
- nixie does not read whether you closed a pull request by hand. The runtime change is in force as
  before. The next export of the branch opens a pull request again.

## Unreadable runtime definitions

- `version` is the erasable field of `definition.changed` that holds the runtime definition. When
  the key store has lost the key of that field, a rebuild of the tables from the log cannot read the
  runtime definition.
- The row of the runtime change exists after such a rebuild. At the next seed, nixie puts the
  definition out of force. The list of definitions shows it as unreadable.
- Whether a forget of yours can destroy that key is not checked (open: erase of a change). If it
  can, the forget also deletes the row of `task_definition_versions`, in its own transaction. The
  live tables and a rebuild then agree.

## Not in scope

- One branch per definition.
- One branch that the task definitions share with the rules.
- A delete of a branch through the `DefinitionsRepo` port.
- A write to the definitions source by nixie outside the export.
