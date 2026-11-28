---
name: verify
description:
  "Uses nixie the way its user would with `bun verify`, on a local test build or a pull request's
  preview, and records the verdict that a feature works. Load it before you check a change in the
  running app, put the verdicts in a PR, or check prod after a release."
metadata:
  wringer-template: 'sha256:a64b90fdf665'
  wringer-command: bun verify
---

# Verify nixie

Use `bun verify` to start the app, use each feature your change touches the way a user would, and
record a verdict that it works. Put the report in the PR with `bun verify publish`, and hand back
the PR link and each feature you could not verify. Leave `bun verify gate` to CI: it reads the
report from the PR description, and fails a PR that changes a feature with no verdict there.

## Key rules

- [Check a change](#check-a-change): for each changed feature, run its journey, check the end state,
  then `done`.
- [Read the envelope](#read-the-envelope): branch on the exit code and `error.code`, never on the
  message.
- [Targets](#targets): check a change on a launch target, a target whose app `bun verify up` starts
  from your worktree.
- [Commands](#commands): read `--help` before you guess a flag.
- [Edit the skill and the registry](#edit-the-skill-and-the-registry): map each new file in the
  registry, read the reference before you edit the skill, and run `lint`.

## References

- [Exit codes](references/exit-codes.md): when a command fails, what to do for its exit code and
  `error.code`.
- [Edit the skill](references/edit-the-skill.md): before you edit this skill or a feature file.
- [Publish the report](references/publish.md): at step 9 of Check a change.
- [Preview setup](references/preview-setup.md) and [the prod check](references/prod-check.md):
  before you attach to `preview` or `prod`.

Read a feature's file before you run its journey.

<!-- wringer:features -->

| Feature            | Summary                                          | File                                                                                 |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| sign-in-enrol      | Sign a browser in with an enrol code             | [references/feature-sign-in-enrol.md](references/feature-sign-in-enrol.md)           |
| chat-turn          | Send a message, and see the reply after it       | [references/feature-chat-turn.md](references/feature-chat-turn.md)                   |
| memory-approval    | Approve a proposed memory                        | [references/feature-memory-approval.md](references/feature-memory-approval.md)       |
| policy-proposal    | Approve a call an ask rule held                  | [references/feature-policy-proposal.md](references/feature-policy-proposal.md)       |
| rule-condition     | Approve a conditional rule, and see it match     | [references/feature-rule-condition.md](references/feature-rule-condition.md)         |
| task-control       | Pause and resume a task                          | [references/feature-task-control.md](references/feature-task-control.md)             |
| coding-session     | Start a coding session from chat                 | [references/feature-coding-session.md](references/feature-coding-session.md)         |
| coding-supervision | Supervise a coding session                       | [references/feature-coding-supervision.md](references/feature-coding-supervision.md) |
| call-hand-off      | Hand a question off in a call                    | [references/feature-call-hand-off.md](references/feature-call-hand-off.md)           |
| call-screen        | Start a call, see its proposal card, and hang up | [references/feature-call-screen.md](references/feature-call-screen.md)               |
| call-device-show   | Show an answer on the call's device              | [references/feature-call-device-show.md](references/feature-call-device-show.md)     |
| drawing            | Draw a picture, edit it, and list both           | [references/feature-drawing.md](references/feature-drawing.md)                       |
| images-page        | Browse and forget images                         | [references/feature-images-page.md](references/feature-images-page.md)               |
| notebook-pages     | Browse notes, open a private one, forget one     | [references/feature-notebook-pages.md](references/feature-notebook-pages.md)         |
| google-connections | Connect a Google account and forget it           | [references/feature-google-connections.md](references/feature-google-connections.md) |
| google-off         | Turn Google off                                  | [references/feature-google-off.md](references/feature-google-off.md)                 |
| mcp-servers        | Connect an MCP server, and call its tool         | [references/feature-mcp-servers.md](references/feature-mcp-servers.md)               |
| computer-shell     | Write and read back a shell file                 | [references/feature-computer-shell.md](references/feature-computer-shell.md)         |
| computer-browser   | Open a page in the assistant's browser           | [references/feature-computer-browser.md](references/feature-computer-browser.md)     |
| computer-screen    | Click a point of the assistant's desktop         | [references/feature-computer-screen.md](references/feature-computer-screen.md)       |
| computer-watch     | Watch the assistant's desktop                    | [references/feature-computer-watch.md](references/feature-computer-watch.md)         |
| computer-off       | Turn the computer off                            | [references/feature-computer-off.md](references/feature-computer-off.md)             |
| trusted-places     | Trust a site once                                | [references/feature-trusted-places.md](references/feature-trusted-places.md)         |
| place-trust-card   | Trust a place from a card                        | [references/feature-place-trust-card.md](references/feature-place-trust-card.md)     |
| job-skills         | Give a job its skills                            | [references/feature-job-skills.md](references/feature-job-skills.md)                 |
| calls-off          | Turn calls off                                   | [references/feature-calls-off.md](references/feature-calls-off.md)                   |
| devices-off        | Turn devices off                                 | [references/feature-devices-off.md](references/feature-devices-off.md)               |
| search-images-off  | Turn search and images off                       | [references/feature-search-images-off.md](references/feature-search-images-off.md)   |
| spend-routes       | Read each route's counts                         | [references/feature-spend-routes.md](references/feature-spend-routes.md)             |
| device-in-browser  | Open the browser's own device full screen        | [references/feature-device-in-browser.md](references/feature-device-in-browser.md)   |
| device-view        | Open the browser's own device                    | [references/feature-device-view.md](references/feature-device-view.md)               |
| device-screen      | Enrol a device and see a picture on it           | [references/feature-device-screen.md](references/feature-device-screen.md)           |
| device-layout      | Lay out a screen in regions, and change them     | [references/feature-device-layout.md](references/feature-device-layout.md)           |
| live-updates       | Pause from the host, see it on the page          | [references/feature-live-updates.md](references/feature-live-updates.md)             |
| mail-wake          | Mail wakes the chat                              | [references/feature-mail-wake.md](references/feature-mail-wake.md)                   |
| phone-text         | A text wakes the chat                            | [references/feature-phone-text.md](references/feature-phone-text.md)                 |
| gmail-tools        | Search and read a mail, and approve a reply      | [references/feature-gmail-tools.md](references/feature-gmail-tools.md)               |
| gmail-wake         | A matching Gmail mail wakes the chat             | [references/feature-gmail-wake.md](references/feature-gmail-wake.md)                 |
| calendar-tools     | Read the calendar, and approve an invitation     | [references/feature-calendar-tools.md](references/feature-calendar-tools.md)         |
| drive-tools        | Search the files, and create a text file         | [references/feature-drive-tools.md](references/feature-drive-tools.md)               |
| conversation-reset | Reset the conversation from the host             | [references/feature-conversation-reset.md](references/feature-conversation-reset.md) |

<!-- /wringer:features -->

## Check a change

1. Run `bun verify report`. In `data.report.features`, a feature shows `changed: true` when a file
   that its `entries` import, or that matches its `extra`, differs from the default branch,
   committed or not.
2. Pick the target your task names, or the first launch target in the [Targets](#targets) table. Run
   the commands in its row. Expect from `up` or `attach`: `ok: true`, and the app's endpoints in
   `data.endpoints`.
3. Run `bun verify doctor`. Expect: `data.passed: true`. When a check fails, fix its cause, and run
   `doctor` again.
4. Run the journey from the feature's file in [References](#references). Its first line,
   `use --feature`, records each later command under that feature. Expect: each command exits 0.
   When one fails, do what its row in [Exit codes](references/exit-codes.md) says.
5. Compare the app with the feature's end state:
   - When it matches, and no command failed with `read-only`, go on to step 6.
   - When your change broke the feature, fix the app's code. Then run `bun verify up --restart`,
     `bun verify doctor` and the journey again.
   - When your change means to change the end state, fix the feature's file, and run
     `bun verify lint`. Then run the journey again.
   - Otherwise, such as a `read-only` failure or a bug your change did not cause, skip `done`. List
     the feature in your reply with the end state you expected and the `data` you got.
6. Record the verdict. Finish each edit to a file the feature owns first: an edit after `done` makes
   the verdict `stale`. Then run `bun verify done`. Expect: `ok: true`. `done` never reads the end
   state, and fails with `check-failed` until a journey command succeeds after `doctor`.
7. Repeat steps 4 to 6 for each feature with `changed: true`, and for each feature your task names,
   in the order of the table in [References](#references).
8. Run `bun verify report --human`. Expect: `verified` on each changed feature you did not skip in
   step 5. Repeat steps 4 to 6 for each `stale` feature.
9. Push the branch, and open a PR for it when none is open: `publish` fails without one. Publish
   with [the publish steps](references/publish.md), even when you skipped a feature. Expect:
   `ok: true`, and `data.action` of `created`, `replaced` or `unchanged`.
10. End the run: `bun verify down` after `up`, or `bun verify detach` after `attach`.

## Read the envelope

Each command prints one JSON envelope as its last line, or text with `--human`. A streaming command,
such as `doctor`, prints JSON event lines first. Add `--brief` for one short line and no event
lines; it leaves out `error.hint`.

Read `ok`, then `data` on success, or `error.code`, `error.message` and `error.hint` on failure.
`evidence` lists the files the command kept, under `.wringer/`, and `truncatedPath` names the file
that holds `data` when it was too large to print. When a command fails, do what its row in
[Exit codes](references/exit-codes.md) says.

## Targets

`bun verify up` starts a launch target's app and `down` stops it. `attach` connects to an attach
target, whose app runs apart from `bun verify`, and `detach` leaves it running. Your edits never
reach an attach target, so check a change on a launch target.

`bun verify use --target <target>` points every later command at a target, and saves the choice in
this worktree's `.wringer/`. `--target` on one command points that command alone. With neither, a
command runs on the registry's first target.

<!-- repo: targets -->

| Target    | Start with                                                  | Access     | Notes                                                               |
| --------- | ----------------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| `local`   | `bun verify use --target local`, then `bun verify up`       | read-write | Test build, scripted model.                                         |
| `preview` | `bun verify use --target preview`, then `bun verify attach` | read-write | The PR's preview, real model; [setup](references/preview-setup.md). |
| `prod`    | `bun verify use --target prod`, then `bun verify attach`    | read-only  | [The prod check](references/prod-check.md).                         |

<!-- /repo -->

## Commands

Run `bun verify --help` for the list, with each command marked `[read]` or `[write]`. A read-only
target refuses each `[write]` command except `publish`. Run `bun verify <command> --help` for a
command's flags, or `<group> --help` for a group such as `action`.

- Write a negative number with `=`, as in `--offset=-5`.
- Pass an object as JSON text, as in `--filter '{"shelf":"top"}'`.

<!-- repo: commands -->

- Pass `--role` and `--name` to `browser type` and `browser click`, or `--ref` from the last
  snapshot.

<!-- /repo -->

## Edit the skill and the registry

<!-- repo: registry -->

Declare the registry in
[`create-verify-registry.ts`](../../../verify/src/verify/create-verify-registry.ts) and each
feature's entries in [`feature-files.ts`](../../../verify/src/verify/feature-files.ts). Give a
feature its web route files, its tool or part files under `apps/server/src/part/`, and its module's
index file.

<!-- /repo -->

A file that a feature's entry imports needs no edit. Add any other file to a feature's `extra`, to
`.shared()` or to `.ignore()`, which fits a file the running app never reads, such as a test. The
gate fails on a changed file that no feature owns and no glob matches. `bun verify features` lists
each feature's entries and how many files they reach, and `--feature <name>` lists those files.

When a change to a feature breaks its journey, fix the journey in the same PR. Before you edit this
skill or a feature file, read [Edit the skill](references/edit-the-skill.md). After you change this
skill, a feature file or the registry, run `bun verify lint`, and fix each failure it reports.

**Reply:** the PR link that `bun verify publish` returned in `data.pr.url`, and each feature you
could not verify, with the command that failed and its `error.code`, or the end state you expected
and the `data` you got.
