<!-- Generated file — do not edit. Edit agents/project.md here, or agents/shared.md in zgeoff/tools. -->

# Agent Guidelines

## Operations

- AGENTS.md is generated from `agents/shared.md` and `agents/project.md` — edit the partials, never
  AGENTS.md itself. The shared partial is synced from
  [zgeoff/tools](https://github.com/zgeoff/tools); cross-project rule changes belong there.
- Perform all work on a branch in a git worktree under `.worktrees/` (e.g.
  `git worktree add .worktrees/<branch> -b <branch>`) — never commit directly on `main`.
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

## Code style

Mechanically enforced rules (oxfmt, oxlint, format-codemod) aren't repeated here — this file covers
what tooling can't check.

- One primary export per file, and the file name kebab-cases that export (`with-jest-context.ts`
  exports `withJestContext`). Exceptions: `index.ts` entrypoints, `types.ts` for a package's shared
  types, and side-effect-only modules, which are named for what they do (`augment-bun-test.ts`).
- Module order: imports, the primary export, then private helpers in composition order (depth-first)
  — never helpers first. Supporting declarations (consts, interfaces, type aliases) sit directly
  above their first use, never below it and never leading the file; types for the primary export's
  signature may sit just above it.
- Acronyms stay uppercase in identifiers (`runCLI`, `parseCLIArgs`, `ASTNode`, `pkgURL`,
  `isPackageJSON`) — except when one starts a camelCase name, where it lowercases whole (`cliPath`,
  `astNode`). ID counts as an acronym: `userID`, `sessionID` — never `userId` — and `idToken` when
  it starts a name. File names are unaffected: kebab-case lowercases everything (`parse-cli-args.ts`
  exports `parseCLIArgs`).

### Function naming

Every function name starts with a prefix from the closed list below: pick from it, or extend this
file in the same PR that introduces the new verb. The prefix is a contract — a reader should know
the function's shape without opening it.

**Predicates** — return boolean, no side effects:

| Prefix   | Contract                | Example          |
| -------- | ----------------------- | ---------------- |
| `is`     | type or state test      | `isVarDecl`      |
| `has`    | containment, possession | `hasBlankLine`   |
| `can`    | capability              | `canResize`      |
| `should` | policy decision         | `shouldSkipFile` |
| `needs`  | requirement             | `needsBlankLine` |

**Pure producers** — result comes from arguments alone, no side effects:

| Prefix                        | Contract                                                                  | Example             |
| ----------------------------- | ------------------------------------------------------------------------- | ------------------- |
| `build<Result>[From<Source>]` | default constructor for values; drop `From<Source>` when no single source | `buildEditsFromAST` |
| `define<X>`                   | identity; its only job is compile-time constraint of its literal argument | `defineErrors`      |
| `parse`                       | unstructured input → structure, invalid input reported                    | `parseSource`       |
| `encode`                      | structure → its defined compact or wire form, reversed by `decode`        | `encodeState`       |
| `decode`                      | `encode`'s output → the original structure, malformed input reported      | `decodeState`       |
| `derive`                      | one-way cryptographic derivation from secret material                     | `deriveAvatarKey`   |
| `plan`                        | compute an action without performing it                                   | `planGapEdit`       |
| `pick`                        | select among known alternatives                                           | `pickMode`          |
| `find`                        | search that can miss — null/undefined on miss                             | `findPrevious`      |
| `get`                         | cheap access that cannot miss (throwing on a broken invariant is fine)    | `getNodeEnd`        |
| `collect`                     | gather from a traversal or scan                                           | `collectChildNodes` |
| `count`                       | how many                                                                  | `countNewlines`     |
| `split`                       | one value → parts                                                         | `splitLines`        |
| `merge`                       | parts → one value                                                         | `mergeWindows`      |
| `sort`                        | reorder                                                                   | `sortEdits`         |
| `format`                      | value → human-readable string                                             | `formatRange`       |
| `render`                      | structure → output text or markup                                         | `renderHunk`        |
| `normalize`                   | variant forms → the canonical form                                        | `normalizePath`     |
| `resolve`                     | follow indirection to a concrete value                                    | `resolveBinPath`    |
| `expand`                      | compact form → full form                                                  | `expandInputs`      |
| `compress`                    | value → its reversible compact encoding                                   | `compressGraph`     |
| `decompress`                  | reverse a `compress` encoding (non-encoded shorthand is `expand`)         | `decompressGraph`   |
| `to<Result>`                  | cheap representation change                                               | `toPosixPath`       |
| `transform`                   | a package's own source→source operation                                   | `transform`         |

**Effectful** — touches the world (filesystem, streams, processes, registries):

| Prefix         | Contract                                                                                                                                | Example            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `apply`        | perform previously planned changes                                                                                                      | `applyEdits`       |
| `create`       | bring a resource into existence (file, directory, process)                                                                              | `createWorkDir`    |
| `claim`        | atomically take exclusive ownership of a work item or resource; ownership ends at commit or an explicit release                         | `claimNextChain`   |
| `read`         | pull raw content from filesystem or network into memory                                                                                 | `readSource`       |
| `load`         | read **and** parse into a ready structure                                                                                               | `loadConfig`       |
| `write`        | persist to the filesystem                                                                                                               | `writeOutput`      |
| `remove`       | delete a resource                                                                                                                       | `removeStaleDist`  |
| `update`       | mutate existing state or resource in place                                                                                              | `updateIndex`      |
| `upsert`       | single-statement insert-or-update keyed by a natural or composite key, refreshing the conflicting row's columns in place                | `upsertUser`       |
| `set`          | assign a store's named state slice wholesale — the store-setter idiom; partial mutation is `update`                                     | `setSelectedNode`  |
| `toggle<Flag>` | invert a boolean state slice                                                                                                            | `toggleDevCamera`  |
| `reset`        | return state to its initial value                                                                                                       | `resetCombatState` |
| `print`        | write to stdout/stderr                                                                                                                  | `printHelp`        |
| `run`          | execute a subprocess, task, or whole pipeline                                                                                           | `runCLI`           |
| `check`        | evaluate and report findings; effects allowed per mode                                                                                  | `checkFile`        |
| `try<X>`       | X with failures captured as a value instead of a throw                                                                                  | `tryCheckFile`     |
| `register`     | add to a registry the caller doesn't own                                                                                                | `registerMatcher`  |
| `subscribe`    | attach a listener to an event source, returning or enabling detachment                                                                  | `subscribeToTicks` |
| `unsubscribe`  | detach what `subscribe` attached                                                                                                        | `unsubscribe`      |
| `assert`       | throw when an invariant doesn't hold                                                                                                    | `assertSpan`       |
| `require`      | throw unless a runtime condition holds — a guard real input can trip (`assert` covers invariants)                                       | `requireAuth`      |
| `verify`       | test a claim or credential against evidence, rejecting on mismatch                                                                      | `verifySession`    |
| `emit`         | dispatch an event or notification                                                                                                       | `emitProgress`     |
| `send`         | transmit a payload to a remote receiver (fire-and-forget or RPC — no resource semantics; REST mutations are `create`/`update`/`remove`) | `sendWebhook`      |
| `wait`         | block until an event or condition resolves; may return the awaited value                                                                | `waitForMessage`   |
| `setup`        | prepare the environment or fixture the following code assumes; `teardown` reverses it                                                   | `setupTest`        |
| `teardown`     | release what `setup` prepared                                                                                                           | `teardownTest`     |
| `start`        | put a long-running resource into service (server, worker, poll loop); `stop` reverses it                                                | `startQueues`      |
| `stop`         | take a long-running resource out of service, releasing what `start` acquired                                                            | `stopWorker`       |
| `drain`        | consume a pending backlog until empty                                                                                                   | `drainJobs`        |

**Wrappers and factories** — the result is behaviour, not data:

| Prefix    | Contract                                  | Example           |
| --------- | ----------------------------------------- | ----------------- |
| `with<X>` | HOF that runs a callback inside a context | `withJestContext` |
| `make<X>` | factory whose result is itself a function | `makeExcluder`    |

**Framework conventions** — where the ecosystem's prefix is load-bearing, it wins:

| Prefix                   | Contract                                                                                                                | Example          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `use<X>`                 | React hook — the prefix drives rules-of-hooks linting; helpers inside a hook follow the normal taxonomy                 | `useDebounce`    |
| `on<Event>`              | event-callback prop or parameter                                                                                        | `onRowClick`     |
| `handle<Event>`          | local implementation passed to an `on<Event>` prop — the idiomatic React pair; the `handle` ban applies everywhere else | `handleRowClick` |
| `handle<LifecycleEvent>` | implementation of an engine lifecycle callback, keyed by the engine's lifecycle-event enum                              | `handleTick`     |

**Banned** — each is a vaguer or synonymous form of a listed verb; use that one instead: `handle`
(except the `handle<Event>` framework conventions), `process`, `manage`, `do`, `perform` (say what
it does), `execute` (→ `run`), `compute` (→ `build`), `fetch` (→ `read`), `save`/`store` (→
`write`), `delete` (→ `remove`), `search`/`lookup` (→ `find`/`get`).

Algorithm-native vocabulary (`walk`, `backtrack`, `slideDiagonal`) is allowed inside the module
implementing that algorithm — forcing list verbs onto textbook terms hides the algorithm.

## Dependencies

- Pin exact versions — no `^`/`~` ranges. (`bun add` saves exact automatically via `exact = true` in
  bunfig.toml — the rule applies to hand-written edits.)

## Review bots

CodeRabbit reviews every PR. Its shared config lives in the zgeoff/coderabbit repo, and a repo-root
`.coderabbit.yaml` with `inheritance: true` layers repo-specific settings on top. CodeRabbit reads
this file as its guidelines. A repo that runs another review bot names it and its config in
`agents/project.md`, and these rules cover that bot too.

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
