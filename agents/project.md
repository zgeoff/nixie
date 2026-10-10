# nixie

A personal assistant platform. The project is in the design phase and has no product code.

## Docs layout

[docs/README.md](docs/README.md) is the index. The root of `docs/` holds the overview, the
principles and the scope. `docs/decisions/` holds numbered decision records: the numbers are stable
IDs, the records stay flat, and the index groups them by topic. The brainstorm and research are
archived at the `research-archive` tag, and a decision supersedes any research recommendation it
covers.

`docs/design/` holds designs for what is not built yet, and `docs/architecture/` holds what is
built. Both use the topics the index uses for decisions: core, policy, memory, channels, connectors
and deployment. `docs/design/open-items.md` lists the choices, later stages and imp candidates, and
links the Linear project that tracks spikes and design tasks.

The structure grows by these rules:

1. A topic folder is created when its first doc exists, and starts as flat files.
2. A topic gets a README index once it holds more than 3 docs.
3. A component gets its own subfolder once it has more than one doc.
4. A topic splits when its docs stop referring to each other.
5. A new or split topic updates the topic list in the docs index, and the decision groups follow it.

## Spikes

`spikes/` holds throwaway experiments that answer research questions. Each spike is its own Bun
package, and its README gives the question, how to run it, and what it found. Product code never
imports from a spike.

## Keeping the docs lean

The docs stay small enough for one reader to hold. Decision records state the locked baseline as it
stands, and design docs state contracts. Evidence lives in the spike that produced it, choices,
later stages and imp candidates live in `docs/design/open-items.md`, spikes and design tasks live in
the Linear project it links, and terms follow `docs/glossary.md`. The `project-docs-writing` skill
holds the detail.

## Docs lifecycle

TODO: how design docs become architecture docs as slices land.

## Code layout

[docs/design/code-layout.md](docs/design/code-layout.md) sets the workspace folders, the package
boundaries and the conventions every package follows. Workspace packages use the `@heynixie/` npm
scope. The repo and the product keep the name nixie.

## Choices that need the owner

The owner decides architecture, framework, library and technology choices, along with naming and
anything about how nixie feels to use. Each such choice goes into open items with its options and a
recommendation, and a decision record exists only for what the owner agreed.

Everything else runs without the owner: run spikes, close questions that evidence or an existing
decision settles, and set configurable defaults for tuning values. Bring the owner only the final
decisions, each with its options, a recommendation and the trade-off.

## Public repo

The repo is public, so every commit, PR, issue and review reply stays free of private detail:

- No home directory paths, host names, tailnet names, or details of the owner's cloud. The
  deployment repo holds those.
- No name of an AI asset generator, and no statement that an asset is generated. Strip image
  metadata before committing an asset.
- No name for the owner's coordinator agent.
- The docs justify nixie on its own terms, never by comparing it to another system.

Grep a diff for `sk-ant`, `GOCSPX`, `AGE-SECRET-KEY`, `ops_`, `/home/` and `.ts.net` before you push
it. gitleaks runs in the pre-commit hook and in CI.

## Review and merge

- Every PR gets a local review before the owner sees it. Codex reviews first
  (`codex review --base origin/main < /dev/null`), and an Opus review agent reviews when Codex is
  unavailable or times out. Answer every finding: fix it, or reply with the reason you declined it.
- CodeRabbit never blocks a PR that has a local review. When it is rate-limited or paused, or has
  not reviewed within 10 minutes of the PR opening, the PR goes ahead without it.
- A PR merges only on the owner's word, after CI is green and every finding is answered. Merge with
  a squash, never with `--admin` or any other ruleset bypass.
- Commit messages and PR bodies carry no attribution lines: no co-author trailers and no generator
  notes.
- After a merge, remove its worktree and its local and remote branches.

## Linear

The nixie project in Linear tracks slices, spikes and design tasks, and
[open items](docs/design/open-items.md) links it. A PR body names its issue with one relationship:

- `Fixes GEO-<n>`: merging meets the issue's acceptance.
- `Contributes to GEO-<n>`: the PR delivers part of the issue, and work remains.
- `Related to GEO-<n>`: context only, and the issue's status does not change.

## Secrets

Spike and deployment secrets live in the `nixie` 1Password vault, and the `op` CLI reads them with a
service-account token scoped to that vault. Claude Code loads the token from
`.claude/settings.local.json` (`env.OP_SERVICE_ACCOUNT_TOKEN`), which git ignores; any other agent
reads it inline from that file. The token expires after about 7 days, and `op-mint nixie` mints a
new one.

- Read a secret with `op read 'op://nixie/<item>/<field>'` straight into the command that uses it.
  Never print a token or a secret value, and never write one to a file in the repo.
- Spike READMEs name the item they read. `.env` holds no live credential.

## Toolchain

- Bun is pinned in `.bun-version`. `bun run format` fixes formatting, and `bun run check` runs the
  format check, lint and the prose check that CI runs.
- lefthook runs oxlint, oxfmt and gitleaks before a commit, commitlint on the message, and the
  checks before a push.
- commitlint takes a lowercase Conventional Commit header of at most 72 characters.
- AGENTS.md is built from `agents/shared.md` and this file by `bun run build:agents`, and CI fails
  when the committed AGENTS.md differs from the build.
