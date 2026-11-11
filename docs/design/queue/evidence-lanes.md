# The evidence lanes and the read paths on production

A build never proves itself with a test message to the agent of a production deployment, because
such a turn writes into real memory. This doc lists each evidence lane: a named way to get
acceptance evidence for a build with no such turn. It also lists each read path, which is a way to
read a production deployment, and gives the side effect of each. When a design or a slice of
[the slices](slices/operations.md) gives a lane's name, it means a lane of this doc.

The section "Built" gives the lanes and read paths that exist in the repo. The section "The lanes of
the designed system" gives how the designs of this folder change them. A place marked
`(open: <name>)` is not settled: see [the open list](open/operations.md), which links the issues.
"You" in this doc is the person the production deployment works for, who may differ from the builder
who runs a lane. Other terms are in the [glossary](../../glossary.md).

## Built

Run every command from the repo root unless the row gives a folder.

| Lane                          | Command                                                                                                                       | Credential                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Static checks                 | `bun run lint && bun run typecheck && bun run check:docs`                                                                     | none                                          |
| Unit and integration          | `bun run test`                                                                                                                | none                                          |
| Agent SDK on a stub model     | `bun run test:agent-sdk`                                                                                                      | none                                          |
| Browser and journeys          | `bun run test:browser && bun run test:journeys`                                                                               | none                                          |
| e2e crash tests               | `bun run test:e2e`                                                                                                            | none                                          |
| Spawned nixie, scripted model | `bun run test:e2e`                                                                                                            | none                                          |
| Real restic                   | `NIXIE_RESTIC_BINARY=<path_to_restic> bun run test:restic`                                                                    | none                                          |
| Test imp                      | `bun run test:imp <test_file>`, with the variables of the [imp isolation runbook](../../runbooks/imp-isolation-tests.md)      | the URL and token of a real impd              |
| Preview stack                 | in `preview/`: `NIXIE_PREVIEW_BIND=127.0.0.1 docker compose up --build --wait`                                                | a credential broker for the model call        |
| Memory checker eval           | `env -u ANTHROPIC_API_KEY bun evals/memory-checker/run-memory-checker-eval.ts <set> [<invented_name>]`, then `bun test evals` | a local coding-agent login, or an imp's       |
| Memory writer eval            | `env -u ANTHROPIC_API_KEY bun evals/memory-writer/run-memory-writer-eval.ts`, then `bun test evals`                           | a local coding-agent login, or an imp's       |
| Committed eval reports        | `bun test evals`                                                                                                              | none                                          |
| SDK contract suite            | `ANTHROPIC_AUTH_TOKEN=imp-broker-placeholder NIXIE_SDK_CONTRACT=1 bun run test:model-api`                                     | an imp whose broker adds the model credential |
| Offline retrieval harness     | in `research/memory-retrieval/`: `bun install`, then `bun run.ts`                                                             | none                                          |
| Offline harness, real turns   | in `research/memory-retrieval/`: `bun real-turns.ts stats --plain <plain>`                                                    | a plain export, which only you can make       |
| Read-only read of production  | a read path of [the read paths](#the-read-paths-on-a-production-deployment)                                                   | a grant from you for each access              |

`<path_to_restic>` is the path of a restic binary, `<test_file>` is a test file of the imp lane,
`<set>` is a labelled set of the eval, `<invented_name>` is a made-up name for the eval's cases, and
`<plain>` is the path of a plain export.

| Lane                          | Proves                                                                                       | Cannot prove                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Static checks                 | lint rules, types, prose rules, links, and that a file holds or lacks a line                 | any behaviour                                                |
| Unit and integration          | one module's logic, and one flow across packages with nixie in process and a stub guest      | the real guest, the Agent SDK, a model's behaviour, a crash  |
| Agent SDK on a stub model     | the conversation guest and the pinned Agent SDK against a stub model                         | what a live model does                                       |
| Browser and journeys          | the web client, and whole journeys through it                                                | a model's behaviour                                          |
| e2e crash tests               | recovery after a kill at a named fault point, and that no action repeats                     | a model's behaviour, a real sandbox                          |
| Spawned nixie, scripted model | the server's test bundle as a child process with the real conversation guest                 | what a live model says, and the release bundle's own paths   |
| Real restic                   | the backup job against real restic repositories on local disk                                | a cloud backend's deletion, versioning and timing            |
| Test imp                      | sandbox isolation and the broker path                                                        | anything about a model's returns                             |
| Preview stack                 | a whole turn on a fresh database with a live model, and the web client against a real server | sandbox isolation, the backup job, a deployment's own memory |
| Memory checker eval           | the production checker prompt on labelled sets, 3 calls a pair                               | the checker on a deployment's real messages                  |
| Memory writer eval            | the production writer prompt and tools on committed cases                                    | the writer on a deployment's real turns                      |
| Committed eval reports        | that each committed report came from the prompt and inputs in the repo                       | a score, which only an eval with a model gives               |
| SDK contract suite            | each Agent SDK behaviour nixie relies on, against the live model                             | nixie's own behaviour                                        |
| Offline retrieval harness     | retrieval methods on synthetic items and questions                                           | retrieval on real memory                                     |
| Offline harness, real turns   | ranking, floors and item counts on a deployment's own turns, with no turn sent               | anything on data the export lacks                            |
| Read-only read of production  | what the deployment recorded: records, task states, memory versions, backup state, logs      | how a changed build behaves                                  |

More on single lanes:

- The pull request's CI run adds `bun run lint:full` to the static checks. Never run it locally. A
  design can also give a `git grep` over the repo's text as a static check.
- "Unit and integration", "e2e crash tests" and "Spawned nixie, scripted model" need the network
  once, to download the model files of the memory encoder. The integration flows are in
  `integration/`.
- `bun run test:e2e` runs both e2e lanes. The crash tests are the suites in `e2e/crash/`, and the
  other lane is every suite that calls `startSpawnedNixie`. Such a suite starts the server's test
  build as a child process. So it proves signals, exit codes, restarts on one data directory and the
  host commands. It cannot prove the code of the release build that the test build compiles out.
- The browser lane needs 8 GiB of memory.
- With neither `NIXIE_RESTIC_BINARY` nor `CI` set, every suite of "Real restic" skips. The image
  workflow runs the lane in CI.
- "Test imp" needs a real impd on a host with `/dev/kvm`.
- The preview stack needs Docker. Run it on a host that holds nothing a guest must not reach: an imp
  is such a host. After the stack is up, run the
  [preview API check](../../runbooks/preview-api-check.md). The test sandbox of the preview does not
  isolate a guest, and the preview's config turns backups off.
- The 2 memory evals need a model credential: the login of a coding agent on the builder's machine,
  or the credential that an imp's broker adds.
- The SDK contract suite takes about 8 minutes. It fails outside an imp, and without
  `NIXIE_SDK_CONTRACT` it passes with no test.
- The offline retrieval harness needs the network for the encoder models. Its
  [setup](../../../research/memory-retrieval/real-turns.md#setup) holds the other commands of the
  real-turns harness and what a plain export is: a decrypted copy of a deployment's records and
  memory. Only you can make one, it exists only on your machine, and no command in this repo writes
  it.

The SDK contract suite, each eval and the preview stack call a model outside production. They spend
the credential's quota and write nothing to any production deployment. The preview stack is a
deployment of its own on a fresh database with invented data, and its turn writes there only.

## The read paths on a production deployment

| Read path                                   | Reaches                                                | Side effect of the read                                |
| ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| API read procedures                         | records, tasks, memory versions, the backup notice     | moves the session's last seen time                     |
| Host commands that list                     | readiness, sessions, pending proposals, subject counts | none known (open: list command writes)                 |
| `nixie memory-subjects --dry-run <db_copy>` | what a release's migrations do to memory               | a full temp copy of the named `nixie.db` while it runs |
| The memory export                           | every memory item with its history                     | one record for each export                             |
| `nixie backup --to <directory>`             | both databases, keys included                          | a full copy that holds every key                       |
| The server's log lines                      | events, errors, step timings                           | none in nixie                                          |

`<db_copy>` is the path of a `nixie.db` copy, and `<directory>` is an empty folder for the backup.
The 2 databases are `nixie.db`, which holds the records, and `keys.db`, which holds the key of each
encrypted record.

- The API read procedures are `conversation/read`, `tasks/list`, `tasks/read`, `tasks/readActions`,
  `memory/readVersions`, `memory/readRatingNotes`, `memory/writerStatus`,
  `memory/consolidatorStatus`, `backups/readNotice`, `records/follow` and `sessions/list`.
- An API read needs a device session. Enrolling one is a write: you issue a code, and nixie records
  the enrolment. Each call then moves the session's last seen time, with no record, and stops the
  session from lapsing.
- The host commands that list are `nixie health`, `nixie sessions`, `nixie memory-pending`,
  `nixie skill-pending`, `nixie skill-written`, `nixie prompt-pending` and `nixie memory-subjects`.
  Each needs a shell in nixie's container and no device session, so no last seen time moves.
- `nixie memory-subjects --dry-run <db_copy>` opens the copy read-only, writes a full copy into the
  temp folder, migrates that copy and removes it. The copy comes from `nixie backup --to`, so that
  command's row applies first.
- The memory export writes a record before the file streams. You run the export yourself: an agent
  never does, with or without a grant.
- `nixie backup --to <directory>` writes nothing to either database. It takes the backup lock and
  writes a full copy, which holds every key. You decide each time whether anyone runs it.
- The deployment's log tooling may record a query of the server's log lines.
- Never read the database files of a production deployment in place. Read a copy from
  `nixie backup --to`.
- The memory export is the only read path that records that a read happened.

## Rules

- A lane never sends a turn to a production deployment.
- Only "Read-only read of production" reads a production deployment. "Offline harness, real turns"
  reads a plain export of one, on your machine.
- A lane that skips its tests has not passed.
- An agent that reads production needs a grant from you for the read path it uses, and reports which
  read path it used.
- A pull request that adds a harness, such as an eval, adds its lane as a row of both lane tables.
- A step that only one deployment needs, such as a command on its cluster, belongs in that
  deployment's own delivery notes, outside this repo.
- When a design gives a lane in its own words, it means the lane with the nearest name. "Unit" is
  "Unit and integration". A check of a doc's text is "Static checks". "e2e" is "e2e crash tests"
  when the check kills nixie at a fault point, and "Spawned nixie, scripted model" otherwise.
- A deploy or a rollback can need an edit of a production deployment's config. You make that edit,
  and it never counts as acceptance evidence.

## The lanes of the designed system

The designs of this folder delete the 2 built-in memory tasks: the note-taker, which the lane tables
call the memory writer, and the consolidator. The designed system has the lanes and read paths of
the Built section, with these differences. [The slices](slices/operations.md) list the edits that
make this doc match.

- The lane "Memory writer eval" does not exist. "Memory checker eval" exists, because the
  conversation's write gate calls the checker.
- "Committed eval reports" checks the checker's reports only.
- `startSpawnedNixie` cannot turn the note-taker on, and the scripted model for the note-taker does
  not exist.
- The API has no `memory/readRatingNotes`.
- `memory/writerStatus` and `memory/consolidatorStatus` each return `isEnabled: false` (open: status
  procedures).

## Not in scope

- A lane that sends a turn to a production deployment.
- The steps on one deployment's host.
