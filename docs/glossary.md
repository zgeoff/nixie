# Glossary

These are the terms the docs and the code use. Each term means one thing. The docs address you, the
one person a nixie deployment works for.

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

| Term               | Meaning                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------ |
| memory item        | One stored fact, with its provenance and its evidence                                      |
| evidence           | Your quote that backs a memory item                                                        |
| retire             | Stop using a memory item in recall, with undo                                              |
| forget             | Destroy a memory item's key, so the item is unreadable everywhere                          |
| definitions        | Your persona, jobs and policy seed                                                         |
| definitions source | Where nixie reads the definitions from, such as a git repo, a local path or bucket storage |

## Connectors and sandboxes

| Term            | Meaning                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| connector       | nixie's code for one outside service                                                         |
| external server | Any MCP server that is not part of nixie's code                                              |
| coding adapter  | How nixie starts and steers coding sessions, with atc first                                  |
| sandbox adapter | How nixie runs sandboxed work, with imp as the reference and containers as an alternative    |
| imp             | A sandboxed microVM, from the imp project, that runs workers, the conversation and code runs |
| grant           | A credential that imp's broker injects into one imp, so the guest sees only a placeholder    |
| binding         | The link between a connector and the credential it uses                                      |
| disconnect      | Stop nixie's use of a credential it cannot delete at its source                              |

## Views and records

| Term       | Meaning                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------- |
| dashboard  | The tier 1 view: every task's status, last update and what it waits on, with its controls |
| live view  | The tier 2 view: the dashboard plus finished tasks and what each did and why              |
| event log  | nixie's record of everything it does                                                      |
| record     | One entry in the event log                                                                |
| projection | A table built from the event log, such as the data the dashboard reads                    |
