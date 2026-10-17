# Agent Guidelines

This repo is nixie, a self-hosted personal assistant platform that works for one person. It is in
its first build: `docs/design/` holds the locked design baseline, and `docs/architecture/` covers
the parts built so far.

## Required reading

The rules a task needs are not repeated here. Load the skill for the work before starting it.

| Skill                  | Load before                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `code-style`           | writing, reviewing, or renaming any TypeScript — the shared function-verb taxonomy |
| `testing`              | designing, writing, or reviewing tests                                             |
| `docs-writing`         | writing or editing any committed prose: `docs/`, READMEs, this file, skills        |
| `project-docs-writing` | the same, beside `docs-writing` — nixie's own prose rules                          |

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

These rules cover every workspace package except the spikes in `research/`. A spike pins the exact
versions it ran against, and imports product files by path.

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
- **Repo-sync PRs.** A sync PR that repo-sync opens merges without asking, once CI is green.
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

The repo is public, and everything pushed to it stays public: commits, PRs, issues and review
replies. Keep your own environment out of it, so your setup never leaks through your work.

- Leave out home directory paths, host names, private network names, cloud details, and the names of
  the tools and agents you work with. A private deployment repo holds a deployment's details.
- Explain each choice by what nixie needs, so the reason stays true when other products change.

gitleaks scans each commit and each PR for secrets and tailnet host names, and the pre-push hook
refuses a branch that adds your home directory or host name.

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
