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
- Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages.
  commitlint takes a lowercase header of at most 72 characters.
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

## Repo structure

nixie is one Bun workspace. Every package is private, takes the name `@heynixie/<folder>`, and is
consumed as source through an `exports` map that points at `src/index.ts`.

```text
apps/              deployables
  server/          composition root: wires each adapter into the module that owns its interface
modules/           domain modules, one per design area
adapters/          one outside system each, named <interface>-<system> (sandbox-imp)
guests/            programs that run inside a sandbox; reach nixie only through libs/wire
libs/              shared code that belongs to no domain
e2e/               whole-program suites
evals/             checks committed evaluation reports against the code
research/<name>/   spikes: a Bun package each, indexed in research/README.md; CI typechecks
                   them and never runs them, and product code never imports them
deploy/            Compose recipe and reference Kubernetes manifests (outside the workspace)
preview/           throwaway test build of one pull request
docs/
  architecture/    what is built
  decisions/       numbered decision records
  design/          designs for work not yet built; only the owner opens one
  guides/          steps a user does
  runbooks/        operator and contributor procedures
  reference/       generated reference
```

## Packages

Dependencies:

- Every external version lives once, in the root `workspaces.catalog`. A package writes `"catalog:"`
  for an external dependency and `"workspace:*"` for an internal one.
- The root `package.json` declares only tooling.
- Pin exact versions, with no `^` or `~` ranges. `bun add` saves exact versions, so the rule covers
  hand-written edits.

Boundaries:

- `turbo boundaries` checks each dependency against the tags in the root `turbo.json`.
- A lib depends only on libs.
- A module never imports an adapter and never forms a cycle with another module.
- A lib tagged `server-only`, such as `libs/db`, is closed to guests and clients.
- An adapter depends only on the module that owns its interface. The tags allow any module, so
  review enforces this rule.

oxlint refuses each of these imports outside its one package:

- The Agent SDK: `guests/conversation`.
- imp's client: `adapters/sandbox-imp`.
- `bun:sqlite` and the Kysely dialect: `libs/db`.

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
  - A fixed finding's reply cites the commit that fixed it. A declined finding's reply gives the
    reason, and when the finding contradicts this file, this file wins and the reply names the rule.
  - Resolve a thread once its reply is posted. Leave the thread open for the owner when you cannot
    judge the finding.
  - Never teach a bot through chat. A correction to a bot is an edit to its config, in a PR.
  - Request a re-review only when asked, or once for a PR that got no review at all.
- **Merge.** A PR merges only on the owner's word, after CI is green and every finding is answered.
  Squash it, and never use `--admin` or any other ruleset bypass. After a merge, remove its worktree
  and its local and remote branches. Sync PRs that repo-sync opens merge without asking, once CI is
  green.
- **Attribution.** Commit messages and PR bodies carry no attribution lines: no co-author trailers
  and no generator notes.
- **Linear.** A PR body names its issue with one relationship: `Fixes GEO-<n>` when merging meets
  the issue's acceptance, `Contributes to GEO-<n>` when work remains, or `Related to GEO-<n>` for
  context only.
- **Plans.** A plan for work about to be built lives in its Linear issue or its PR, never in
  `docs/`. Planned work, open choices and later stages live in the nixie project in Linear.

## Database

- Every package outside `libs/db` takes its database handle from the writer that `startWriter` in
  `modules/log` returns, and runs each write transaction through `withWriteTransaction`.
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

Secrets live in the `nixie` 1Password vault. Read a secret with
`op read 'op://nixie/<item>/<field>'` straight into the command that uses it. Never print a token or
a secret value, and never write one to a file in the repo.

## Toolchain

- Bun is pinned in `.bun-version`. `bun run format` fixes formatting, and `bun run check` runs every
  check that CI runs.
- lefthook runs the light checks before a commit and a push. Leave the heavier checks to CI, because
  the host may have little memory.
- `bun run lint` is plain oxlint. `bun run lint:full` adds the type-aware pass, and is CI-only:
  never run it locally.
- Run `bun install` in the main checkout before you run `bun run deadcode` or `bun run check` in a
  worktree. knip's config loader looks for a `tsconfig.json` from the directory above the worktree,
  so it reads the main checkout's, and without that checkout's `node_modules` knip exits 1 with
  `File '@tsconfig/strictest/tsconfig.json' not found.`
