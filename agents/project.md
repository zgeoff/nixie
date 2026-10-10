## nixie

This repo is nixie, a self-hosted personal assistant platform that works for one person. It is in
the design phase: the docs hold a locked design baseline, and no product code exists yet.

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
  rejected alternatives and why, and never how the system works now. A changed decision gets a new
  record that supersedes the old one.
- `docs/design/<work>/` holds a design for big, speculative work designed well before its code. A
  design is temporary, and its spikes live in `docs/design/<work>/spikes/<name>/`, each a Bun
  package whose README gives the question, how to run it and what it found. Product code never
  imports from a spike. The owner opens a design; an agent never opens one by default.
- `docs/guides/`, `docs/runbooks/` and `docs/reference/` hold steps a user does, operator and
  contributor procedures, and generated reference. Each arrives with the code it covers.

A plan for work about to be built lives in its Linear issue or its PR, never in `docs/`.

### Docs lifecycle

When work from a design lands, the PR that lands it moves the built part into `docs/architecture/`,
rewritten to describe the code. The PR deletes the rest of the design's folder, spikes included,
once nothing in it is still unbuilt. Decision records stay; architecture docs carry the current
state.

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

## Public repo

The repo is public, so every commit, PR, issue and review reply stays free of private detail:

- No home directory paths, host names, tailnet names, or details of the owner's cloud. The
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
  `audit deadcode format:check lint typecheck boundaries prose test`. A change to that list changes
  `bun run check` in the same PR.
- `turbo.test.ts` proves the tag rules in `turbo.json`, and `oxlintrc.test.ts` proves the import
  confinement in `.oxlintrc.json`. Both run the real tool against throwaway fixture packages in a
  temporary directory.
- lefthook runs oxlint, oxfmt and gitleaks before a commit, and commitlint on the message. Before a
  push it runs one job at a time: the format check, typecheck, boundaries and the prose check over
  the whole tree, and lint and the tests over what the branch changes. commitlint takes a lowercase
  Conventional Commit header of at most 72 characters.
- `bun run build:agents` builds AGENTS.md from `agents/shared.md` and `agents/project.md`. CI fails
  when the committed AGENTS.md differs from the build.
