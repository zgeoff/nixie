---
name: verify
description:
  "Uses nixie the way its user would with `bun verify`, on a local test build or a pull request's
  preview, and records the verdict that a feature works. Load it before you check a change in the
  running app, put the verdicts in a PR, or check prod after a release."
metadata:
  wringer-template: 'sha256:c276ebe8d896'
  wringer-command: bun verify
---

# Verify nixie

Use `bun verify` to start the app, use each feature your change touches the way a user would, and
record a verdict that it works. Put the report in the PR with step 10 of
[Check a change](#check-a-change), and hand back the PR link and each feature you could not verify.
Leave `bun verify gate` to CI: it fails a PR that changes a feature with no verdict in its
description.

The mistakes that cost the most time:

- **Using the app before `doctor` passes.** `bun verify doctor` checks that the app answers and that
  the browser and terminal drivers work. Until it passes, each command that touches the app fails
  with exit code 3.
- **Editing the app's code while `up` runs it.** The next command that touches the app fails with
  `doctor-required`. Run `bun verify up --restart` and `doctor` again.

## Key rules

- [Check a change](#check-a-change): for each changed feature, run its journey, check the end state,
  then `done`; then push and publish.
- [Read the envelope](#read-the-envelope): branch on the exit code and `error.code`, never on the
  message.
- [Targets](#targets): check a change on a launch target, which `bun verify up` starts.
- [Commands](#commands): read `--help` before you guess a flag.
- [Edit the skill and the registry](#edit-the-skill-and-the-registry): map each new file in the
  registry, read the reference before you edit the skill, and run `lint`.

## References

- [Exit codes](references/exit-codes.md): when a command fails, what to do for its exit code and
  `error.code`.
- [Publish the report](references/publish.md): at step 10 of Check a change.
- [Targets](references/targets.md): before you start or attach to a target.
- [Edit the skill](references/edit-the-skill.md): before you edit this skill or a feature file.
- [Preview setup](references/preview-setup.md) and [the prod check](references/prod-check.md):
  before you attach to `preview` or `prod`.

<!-- wringer:features -->

| Feature            | Summary                                                                   | File                                                                                 |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| sign-in-enrol      | Sign a browser in with an enrol code                                      | [references/feature-sign-in-enrol.md](references/feature-sign-in-enrol.md)           |
| chat-turn          | Send a message, and see the reply after it                                | [references/feature-chat-turn.md](references/feature-chat-turn.md)                   |
| memory-approval    | Approve a proposed memory                                                 | [references/feature-memory-approval.md](references/feature-memory-approval.md)       |
| policy-proposal    | Approve a call that an ask rule held unrun                                | [references/feature-policy-proposal.md](references/feature-policy-proposal.md)       |
| task-control       | Pause and resume a task, and see its records agree                        | [references/feature-task-control.md](references/feature-task-control.md)             |
| coding-session     | Start a coding session from chat                                          | [references/feature-coding-session.md](references/feature-coding-session.md)         |
| call-hand-off      | Hand one question off in a call, and hear the holding line and the answer | [references/feature-call-hand-off.md](references/feature-call-hand-off.md)           |
| drawing            | Draw a picture, edit it, and list both                                    | [references/feature-drawing.md](references/feature-drawing.md)                       |
| images-page        | Browse and forget images                                                  | [references/feature-images-page.md](references/feature-images-page.md)               |
| notebook-pages     | Browse notes, open a private one, forget one                              | [references/feature-notebook-pages.md](references/feature-notebook-pages.md)         |
| google-connections | Connect a Google account and forget it                                    | [references/feature-google-connections.md](references/feature-google-connections.md) |
| computer-shell     | Write and read back a shell file                                          | [references/feature-computer-shell.md](references/feature-computer-shell.md)         |
| computer-browser   | Open a page in the assistant's browser                                    | [references/feature-computer-browser.md](references/feature-computer-browser.md)     |
| computer-screen    | Click a point of the assistant's desktop                                  | [references/feature-computer-screen.md](references/feature-computer-screen.md)       |
| computer-watch     | Watch the assistant's desktop                                             | [references/feature-computer-watch.md](references/feature-computer-watch.md)         |
| device-in-browser  | Make a signed-in browser a device                                         | [references/feature-device-in-browser.md](references/feature-device-in-browser.md)   |
| device-screen      | Enrol a device and see a picture on it                                    | [references/feature-device-screen.md](references/feature-device-screen.md)           |
| device-layout      | Lay out a screen in regions, and change them                              | [references/feature-device-layout.md](references/feature-device-layout.md)           |
| live-updates       | Pause from the host, see it on the page                                   | [references/feature-live-updates.md](references/feature-live-updates.md)             |
| mail-wake          | Mail wakes the chat                                                       | [references/feature-mail-wake.md](references/feature-mail-wake.md)                   |
| gmail-tools        | Search and read a mail, and approve the reply the assistant writes        | [references/feature-gmail-tools.md](references/feature-gmail-tools.md)               |

<!-- /wringer:features -->

## Check a change

1. Run `bun verify report`. In `data.report.features`, a feature shows `changed: true` when a file
   that matches its `paths` in the [registry](#edit-the-skill-and-the-registry) differs from the
   default branch.
2. Pick the target your task names, or the first launch target in the
   [targets table](references/targets.md). Run the commands in its row. `up` or `attach` starts a
   run that lasts until `down` or `detach`. Expect from `up` or `attach`: `ok: true`, and the app's
   endpoints in `data.endpoints`.
3. Run `bun verify doctor`. Expect: `data.passed: true`. When a check fails, fix its cause, and run
   `doctor` again.
4. Run the journey from the feature's file in [References](#references). Its first line,
   `use --feature`, records each later command under that feature, and leaves the target as it is.
   Expect: each command exits 0. When one fails, do what its row in
   [Exit codes](references/exit-codes.md) says.
5. Compare the app with the feature's end state:
   - When it matches, and no command failed with `read-only`, go on to step 6.
   - When your change broke the feature, fix the app's code. Then run `bun verify up --restart`,
     `bun verify doctor` and the journey again.
   - When your change means to change the end state, fix the feature's file, and run
     `bun verify lint`. Then run the journey again.
   - In any other case, such as a `read-only` failure or a bug your change did not cause, skip
     `done`. List the feature in your reply with the end state you expected and the `data` you got.
6. Record the verdict:
   - Finish each edit to a file that matches the feature's `paths` first. An edit after `done` makes
     the verdict `stale`. A commit alone leaves the verdict as it was.
   - Once the end state matches in step 5, run `bun verify done`. Expect: `ok: true`. `done` records
     a verdict for the feature that `use --feature` set.
   - `done` never reads the end state. It fails with `check-failed` until a journey command has
     succeeded after `doctor`.
7. Repeat steps 4 to 6 for each feature with `changed: true`, and for each feature your task names,
   in the order of the table in [References](#references). When a feature's file says to run part of
   its journey last, run that part after every other journey.
8. Run `bun verify report --human`. Expect: `verified` on each changed feature you did not skip in
   step 5. Repeat steps 4 to 6 for each `stale` feature.
9. Push the branch, and open a PR when none exists: `publish` fails without one.
10. Publish the report with [the publish steps](references/publish.md), even when you skipped a
    feature. Expect: `ok: true` and `data.local` of 0.
11. End the run: `bun verify down` after `up`, or `bun verify detach` after `attach`.

## Read the envelope

Each command prints one JSON envelope as its last line, or text with `--human`. `doctor` and other
streaming commands print JSON event lines first. Read these fields:

- `ok`, then `data` on success, or `error.code`, `error.message` and `error.hint` on failure;
- `evidence`: the files the command kept, under `.wringer/`;
- `truncatedPath`: the file that holds `data` when it was too large to print.

When a command fails, find its exit code and `error.code` in [Exit codes](references/exit-codes.md),
and do what that row says.

## Targets

Start a launch target's app with `bun verify up`, and stop it with `bun verify down`. Connect to an
attach target, whose app runs apart from `bun verify`, with `attach`; `detach` leaves it running.
Your edits never reach an attach target's app, so check a change on a launch target.

Run `bun verify use --target <target>` to point every later command at a target. `use` saves the
choice in this worktree's `.wringer/`. `--target` on one command points that command alone. A
command with neither runs on the registry's first target, so run `use` first.

<!-- repo: targets -->

See the [targets table](references/targets.md) for each target's start commands and access.

<!-- /repo -->

## Commands

Run `bun verify --help` for the list, with each command marked `[read]` or `[write]`. A read-only
target refuses each `[write]` command except `publish`, which writes no app data. Run
`bun verify <command> --help` for a command's flags. The top-level list shows only the name of a
group, such as `action`: run `bun verify <group> --help` for its commands.

- Write a negative number with `=`, as in `--offset=-5`.
- Pass an object as JSON text, as in `--filter '{"shelf":"top"}'`.

<!-- repo: commands -->

- Pass `--role` and `--name` to `browser type` and `browser click`, or `--ref` from the last
  `browser snapshot`.

<!-- /repo -->

## Edit the skill and the registry

<!-- repo: registry -->

Declare targets, actions, commands, checks and features in
[`create-verify-registry.ts`](../../../verify/src/verify/create-verify-registry.ts). Edit its globs
in [`feature-paths.ts`](../../../verify/src/verify/feature-paths.ts).

<!-- /repo -->

Map each file your change adds in the registry: add a glob that matches it to a feature's `paths`,
to `.shared()` or to `.ignore()`. The gate fails on a changed file that no glob matches. Add a file
that the running app never reads, such as a test, to `.ignore()`. `bun verify features` lists the
globs.

When a change to a feature breaks its journey, fix the journey in the same PR. Before you edit this
skill or a feature file, read [Edit the skill](references/edit-the-skill.md). After you change this
skill, a feature file or the registry, run `bun verify lint`, and fix each failure it reports.

**Reply:** the PR link that `bun verify publish` returned in `data.pr.url`, and each feature you
could not verify, with the command that failed and its `error.code`, or the end state you expected
and the `data` you got.
