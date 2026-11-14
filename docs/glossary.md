# Glossary

These are the terms the docs and the code use. Each term means one thing. The docs address you, the
one person a nixie deployment works for, and the architecture docs call that person the user.

## Work

| Term             | Meaning                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------ |
| conversation     | Your single chat with nixie. It is a task that never closes, and it routes work to tasks   |
| task             | A durable piece of work with its own context, which you can open and talk to               |
| task run         | One execution of a task, from its start or restart until it waits, stops or closes         |
| worker           | A disposable unit of work behind one tool call, which runs in its own imp                  |
| worker run       | One execution of a worker, from the tool call to its result                                |
| job              | A definition: a schedule or trigger, instructions and a tool list                          |
| job run          | One execution of a job, which is itself a task                                             |
| trigger          | What starts a job run without you, such as a schedule, a webhook or a new email            |
| code run         | One program that the code tool runs in a disposable imp with no grants                     |
| wait             | What a task waits on: your answer, a timer, an action's outcome or a trigger event         |
| inbox            | A task's queue of messages and events that reach it between task runs                      |
| lease            | A task's claim on the runner, which expires so that a crashed task run can restart         |
| supervised agent | An agent nixie starts and steers but that runs under its own rules, such as an atc session |
| model profile    | A named route to one model: endpoint, credential, model, effort and prices                 |
| model role       | A part a model plays for nixie, such as the conversation or the checker, with its profile  |

## Policy

| Term            | Meaning                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| tool            | Anything the model can call. Every action goes through one                             |
| effect          | What a tool declares it does, such as read, send or spend                              |
| action          | A tool call with side effects outside nixie, which runs on the action queue            |
| action queue    | The durable queue that runs actions and records each outcome: done, failed or unknown  |
| rule            | An allow, ask or deny, matched on the tool, its effects and the context                |
| always-ask set  | Spending money, widening rules or approvals, and raising a budget                      |
| lift            | A bounded rule that lifts the always-ask set                                           |
| mandate         | Rules that share an expiry, such as "full authority to ship until 6 pm", ended as one  |
| consent checker | A checker model that confirms your own message asked for an action                     |
| prompt cause    | Why a prompt reached you, recorded with every prompt                                   |
| proposal        | An action that waits for your answer                                                   |
| approval        | Your yes to one proposal, bound to that exact action and used once                     |
| card            | A proposal shown in its thread, with Approve, Always allow, Defer and Decline          |
| defer           | Your answer "not now": the proposal stays pending and returns at the time you pick     |
| approval digest | Everything that waits on your answer, gathered in one place                            |
| notice          | A quiet line in a thread that says what nixie did, such as a memory write or a new job |
| untrusted       | Content that did not come from your own words or your own data                         |

## Memory and definitions

| Term               | Meaning                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------- |
| memory item        | One stored fact, with its provenance and its evidence                                        |
| subject            | Whose a memory item is: owner for a fact about you, shared, or self for a self-note          |
| shared item        | A memory item that lives between you and nixie, such as a deal, a nickname or a running joke |
| self-note          | A memory item nixie writes about itself in its own voice, which you always review            |
| sensitive item     | A memory item, such as an address, whose text retrieval and the events block leave out       |
| evidence           | Your quote that backs a memory item                                                          |
| retire             | Stop using a memory item in recall, with undo                                                |
| forget             | Destroy a memory item's key, so the item is unreadable everywhere                            |
| moment             | A range of records in one thread that nixie keeps whole, with a title, note and reflections  |
| reflection         | A model's reading of a moment, labelled with its model ID and date                           |
| definitions        | Your persona, jobs, skills and policy seed                                                   |
| definitions source | Where nixie reads the definitions from, such as a git repo, a local path or bucket storage   |
| skill              | A procedure in your definitions: instructions, references and scripts, which grants nothing  |
| skill catalog      | The name and description of each skill a caller may load, in its system prompt               |
| vendored skill     | A third-party skill copied into your definitions at a pinned upstream commit                 |
| pin                | A vendored skill's lock entry, a pinned memory item or a task's skill pin: always say which  |

## Connectors and sandboxes

| Term             | Meaning                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| connector        | nixie's code for one outside service                                                                                                                      |
| external server  | Any MCP server that is not part of nixie's code                                                                                                           |
| coding adapter   | How nixie starts and steers coding sessions, with atc first                                                                                               |
| sandbox adapter  | How nixie runs sandboxed work, with imp as the reference and containers as an alternative                                                                 |
| imp              | A sandboxed microVM, from the imp project, that runs workers, the conversation and code runs                                                              |
| test sandbox     | The test-build sandbox adapter that runs each guest as a local process, with no isolation                                                                 |
| guest program    | A program nixie starts in a guest: the guest turn, the sandbox check, the guest purge, the guest summary, the fetcher or a code run's program             |
| memory kill      | The guest's kernel killing one of its processes because the guest used more memory than its sandbox's size                                                |
| size row         | A row of `sandboxSizes`, which belongs to a role and never to a sandbox kind or an image, planned in [GEO-2417](https://linear.app/zgeoff/issue/GEO-2417) |
| image key        | A key of `sandboxImageKeys`, which names one sandbox image and never a sandbox kind or a size row                                                         |
| sandbox manifest | The file in the nixie image that maps each image key to its image ref, pinned by digest                                                                   |
| grant            | A credential that imp's broker injects into one imp, so the guest sees only a placeholder                                                                 |
| binding          | The link between a connector and the credential it uses                                                                                                   |
| disconnect       | Stop nixie's use of a credential it cannot delete at its source                                                                                           |

## Views and records

| Term       | Meaning                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------- |
| dashboard  | The tier 1 view: every task's status, last update and what it waits on, with its controls |
| live view  | The tier 2 view: the dashboard plus finished tasks and what each did and why              |
| event log  | nixie's record of everything it does                                                      |
| record     | One entry in the event log                                                                |
| projection | A table built from the event log, such as the data the dashboard reads                    |

## Operations

| Term           | Meaning                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| backup job     | The separate container, apart from a `job`, that ships each backup set to the restic repositories                                                                                        |
| backup set     | One `nixie.db` copy and one `keys.db` copy that nixie stages in one folder of the staging folder                                                                                         |
| publish number | The positive integer that one publish gives to both the data snapshot and the key snapshot it writes, planned in [GEO-2570](https://linear.app/zgeoff/issue/GEO-2570)                    |
| backup pair    | The key snapshot and the data snapshot that the fetch picks to restore from, planned in [GEO-2562](https://linear.app/zgeoff/issue/GEO-2562)                                             |
| recovery       | One restore, under one recovery ID, planned in [GEO-2564](https://linear.app/zgeoff/issue/GEO-2564)                                                                                      |
| restore marker | The file `restore-incomplete` in the data directory, which a restore writes first and removes once both databases are in place                                                           |
| reader gate    | The stored `oldest_reader` value, raised while nixie is paused so that a release without the pause refuses the database, planned in [GEO-2566](https://linear.app/zgeoff/issue/GEO-2566) |
| test seed      | A function in a module's test utils that puts one record into one state, which is not the definitions seed, planned in [GEO-2565](https://linear.app/zgeoff/issue/GEO-2565)              |
| seeder         | An object whose members are test seeds, bound to a test's dependencies. The actions module has one, and the others are planned in [GEO-2565](https://linear.app/zgeoff/issue/GEO-2565)   |

## Code

| Term     | Meaning                                                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| port     | An interface that one module owns and that has a second real provider in sight, as [the ports doc](architecture/ports.md) defines                                     |
| provider | One implementation of an interface: a real one does the work in a release, and a fake stands in for it in a test, as [the ports doc](architecture/ports.md) describes |
| adapter  | A provider that reaches a system outside nixie, as a package of its own, as [the ports doc](architecture/ports.md) describes                                          |

## Harnesses

| Term               | Meaning                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| harness            | The model loop that runs a profile's turns inside a sandbox, such as the Agent SDK                                                           |
| guest              | The program that runs a harness's loop inside a sandbox, such as the conversation guest of the Agent SDK                                     |
| model runtime      | The program inside a harness that calls the model API, such as the Claude CLI                                                                |
| capability         | One thing a harness can do, such as `resume`, from the wire library's `harnessCapabilities`                                                  |
| harness record     | The `Harness` that `bindHarness` builds from a profile, which host code reads in place of a harness ID                                       |
| harness definition | The one file in the models module that holds a harness's profile type, its schema and its `bind`                                             |
| session point      | The place in a harness's own session where the next step resumes                                                                             |
| turn outcome       | The word in an `ended` frame that tells how a turn ended: `finished`, `stopped`, `limit`, `interrupted` or `overflow`                        |
| `unkept`           | The session position of a task that has an opening, no summary and no session point its harness owns, which nixie derives and stores nowhere |
