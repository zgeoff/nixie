# Agent Guidelines

This repo is nixie, a self-hosted personal assistant platform that works for one person. It is in
its first build: `docs/design/` holds the locked design baseline, and `docs/architecture/` covers
the parts built so far.

## Required reading

The rules a task needs are not repeated here. Load the skill for the work before starting it.

| Skill                  | Load before                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `code-style`           | writing, reviewing, or renaming any TypeScript — the function-verb taxonomy lives there |
| `testing`              | designing, writing, or reviewing tests                                                  |
| `docs-writing`         | writing or editing any committed prose: `docs/`, READMEs, this file, skills             |
| `project-docs-writing` | the same, beside `docs-writing` — nixie's own prose rules                               |

## Operations

- Perform all work on a branch in a git worktree under `.worktrees/` (e.g.
  `git worktree add .worktrees/<branch> -b <branch>`) — never commit directly on `main`.
- Run `bun install` in the main checkout before you run `bun run deadcode` or `bun run check` in a
  worktree. knip's config loader looks for a `tsconfig.json` from the directory above the worktree,
  so it reads the main checkout's, and without that checkout's `node_modules` knip exits 1 with
  `File '@tsconfig/strictest/tsconfig.json' not found.`
- Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages.
- A squash merge makes the PR title the commit subject, so a PR title is a Conventional Commit too.
  `feat(#412): add the retry budget` is a title; `add the retry budget` is not.
- Commit subjects and PR titles use the imperative mood ("add X", never "added X" or a bare noun
  phrase).
- Open PRs against `main` using the PR template (`.github/PULL_REQUEST_TEMPLATE.md`). Descriptions
  are condensed: lead paragraph ≤2 sentences, one-line bullets, ≤150 words — write the short version
  first, don't draft long and trim.
- After pushing, link the PR URL in your response.
- A PR is ready only when its checks are green: watch CI (`gh pr checks <n> --watch`) after opening
  or updating, and report a failure with what you're doing about it.
- Light linting, formatting, and other checks run via lefthook's pre-commit and pre-push hooks.
  Defer to CI for larger checks, as the environment you're operating in may have conservative memory
  constraints.
- `bun run lint` is plain oxlint. `bun run lint:full` adds the type-aware pass, and is CI-only:
  never run it locally.

## Dependencies

- Pin exact versions — no `^`/`~` ranges. (`bun add` saves exact automatically via `exact = true` in
  bunfig.toml — the rule applies to hand-written edits.)

## Review bots

CodeRabbit reviews every PR. Its shared config lives in the zgeoff/coderabbit repo, and a repo-root
`.coderabbit.yaml` with `inheritance: true` layers repo-specific settings on top. CodeRabbit reads
this file as its guidelines. A review bot added later is named here with its config, and these rules
cover it too.

- A PR is ready only after every bot review is read and every finding is answered: a fixed finding's
  reply cites the commit that fixed it; a declined finding's reply states the reason — when a
  finding contradicts this file, this file wins and the reply names the rule. Reviews land within a
  few minutes of opening; read them with `gh pr view <n> --comments` and
  `gh api repos/<owner>/<repo>/pulls/<n>/comments`. A finding outside the diff arrives in the review
  body, not as a thread, so its answer is a PR comment.
- Resolve a thread once its reply is posted, fixed and declined alike (GraphQL
  `resolveReviewThread`). A finding the agent cannot confidently judge is escalation, not
  disposition: reply saying so and leave the thread open for a human.
- Never teach a bot through chat (`@coderabbitai` learnings and the like) — a correction to bot
  behaviour is an edit to its config, reviewed in a PR.
- Bots review a PR once, at open; an agent invokes a re-review only when asked. The exception is a
  PR that got no review at all, such as one opened before the bot was installed: request it once
  with that bot's documented trigger, such as `@coderabbitai review` for CodeRabbit.

## Repo layout

- [docs/design/platform/code-layout.md](docs/design/platform/code-layout.md) sets the code layout:
  the workspace folders, the package boundaries and the conventions every package follows. Workspace
  packages use the `@heynixie/` npm scope, and the repo and the product keep the name nixie.
- [docs/README.md](docs/README.md) indexes the docs.
- Planned work, open choices and later stages live in the nixie project in Linear, which the docs
  index links.

## Docs

Each folder under `docs/` has one job:

- `docs/architecture/` explains what is built: the parts, their boundaries and their invariants,
  grouped in subfolders by area once an area passes about 6 docs.
- `docs/decisions/` holds permanent, numbered decision records. A record states the choice, the
  rejected alternatives and why, and never how the system works now. A changed decision is edited in
  place: the record keeps its number and states the decision as it now stands, its header gains an
  `Updated` date, and a `## Changes` list at its end gives each change's date and a one-line
  summary. A new record is only for a new decision.
- `docs/design/<work>/` holds a design for big, speculative work designed well before its code. A
  design is temporary. Its spikes live in `research/<name>/`, each a Bun package in the workspace
  whose README gives the question, how to run it and what it found, and the
  [spikes index](research/README.md) lists every one. CI typechecks the spikes and never runs them.
  Product code never imports from a spike. The owner opens a design; an agent never opens one by
  default.
- `docs/guides/`, `docs/runbooks/` and `docs/reference/` hold steps a user does, operator and
  contributor procedures, and generated reference. Each arrives with the code it covers.

A plan for work about to be built lives in its Linear issue or its PR, never in `docs/`.

### Docs lifecycle

When work from a design lands, the PR that lands it moves the built part into `docs/architecture/`,
rewritten to describe the code. The PR deletes the rest of the design's folder once nothing in it is
still unbuilt. A spike is deleted once its finding sits in the architecture doc that owns it.
Decision records stay; architecture docs carry the current state.

Load the `docs-writing` and `project-docs-writing` skills before you write any doc. They hold the
writing rules, the size limits and the README contract.

## Working here

- **Choices that need the owner.** The owner decides architecture, framework, library and technology
  choices, naming, and anything about how nixie feels to use. Bring each such choice to the owner
  with its options, a recommendation and the trade-off. A decision record exists only for what the
  owner agreed. Run spikes, close questions that evidence or an existing decision settles, and set
  configurable defaults for tuning values without asking.
- **Review.** Every PR gets a local review before the owner sees it: Codex first
  (`codex review --base origin/main < /dev/null`), or an Opus review agent when Codex is unavailable
  or times out. Answer every finding: fix it, or reply with the reason you declined it. CodeRabbit
  never blocks a PR that has a local review; when it is rate-limited or paused, or has not reviewed
  within 10 minutes of the PR opening, the PR goes ahead without it.
- **Merge.** A PR merges only on the owner's word, after CI is green and every finding is answered.
  Squash it, and never use `--admin` or any other ruleset bypass. After a merge, remove its worktree
  and its local and remote branches. Sync PRs that repo-sync opens merge without asking, once CI is
  green.
- **Attribution.** Commit messages and PR bodies carry no attribution lines: no co-author trailers
  and no generator notes.
- **Linear.** A PR body names its issue with one relationship: `Fixes GEO-<n>` when merging meets
  the issue's acceptance, `Contributes to GEO-<n>` when work remains, or `Related to GEO-<n>` for
  context only.

## Database

- Only `libs/db` imports `bun:sqlite` and the Kysely dialect. Every other package takes its handle
  from the writer that `startWriter` in `modules/log` returns, and runs each write transaction
  through `withWriteTransaction`.
- Every ID that keys the key store is random, from `crypto.randomUUID()`, and never a row number or
  any other sequence. [The database](docs/architecture/core/database.md#key-store-ids) gives the
  reason.
- A migration appends to `nixieSchema` and never changes a released one.
- Every new record the model can see exposes a short ID from `createShortID` in `libs/db`, and the
  model reads and passes that ID, never the record's UUID.
  [Short IDs](docs/architecture/core/database.md#short-ids) gives the reason.

## Public repo

The repo is public, so every commit, PR, issue and review reply stays free of private detail:

- No home directory paths, host names, private network names, or details of the owner's cloud. The
  deployment repo holds those.
- No name for the owner's coordinator agent.
- The docs justify nixie on its own terms, never by comparing it to another system.

Before you push, grep the diff for `sk-ant`, `GOCSPX`, `AGE-SECRET-KEY`, `ops_`, `/home/` and
`.ts.net`. gitleaks runs in the pre-commit hook and in CI.

## Secrets

Secrets live in the `nixie` 1Password vault, and the `op` CLI reads them with a service-account
token scoped to that vault. Claude Code loads the token from `.claude/settings.local.json`
(`env.OP_SERVICE_ACCOUNT_TOKEN`), which git ignores; any other agent reads it inline from that file.
The token expires after about 7 days, and `op-mint nixie` mints a new one.

Read a secret with `op read 'op://nixie/<item>/<field>'` straight into the command that uses it.
Never print a token or a secret value, and never write one to a file in the repo.

## Toolchain

- Bun is pinned in `.bun-version`. `bun run format` fixes formatting, and `bun run check` runs every
  check that CI runs.
- CI runs the shared Bun pull-request workflow from zgeoff/tools. The `BUN_CHECK_SCRIPTS` repo
  variable holds its script list:
  `audit deadcode format:check lint:full typecheck boundaries prose test`. A change to that list
  changes `bun run check` in the same PR.
- lefthook runs oxlint, oxfmt and gitleaks before a commit, and commitlint on the message. Before a
  push it runs one job at a time: the format check, typecheck, boundaries and the prose check over
  the whole tree, then lint and the tests over what the branch changes. commitlint takes a lowercase
  Conventional Commit header of at most 72 characters.
