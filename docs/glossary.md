# Glossary

These terms are tentative. A terminology pass may rename them before any code, and the docs follow
whatever it settles.

| Term               | Meaning                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------ |
| owner              | The one person a nixie deployment works for                                                |
| conversation       | The owner's single chat with nixie, which routes work to tasks                             |
| task               | A durable piece of work with its own context, which the owner can open and talk to         |
| worker             | A disposable unit of work behind one tool call, run in its own imp                         |
| job                | A definition: a schedule, instructions and a tool list. Each run of a job is a task        |
| trigger            | What starts a task without the owner, such as a schedule, a webhook or a new email         |
| tool               | Anything the model can call. Every outside action goes through one                         |
| outside action     | An action with side effects outside nixie, run as an entry on a durable queue              |
| effect             | What a tool declares it does, such as read, send or spend                                  |
| rule               | An allow, ask or deny, matched on the tool, its effects and the context                    |
| always-ask set     | Spending money, widening rules or approvals, and raising a budget                          |
| lift               | A bounded rule that lifts the always-ask set                                               |
| proposal           | An action that waits for the owner                                                         |
| approval           | The owner's yes to one proposal, bound to that exact action and used once                  |
| untrusted          | Content that did not come from the owner's own words or the owner's own data               |
| memory item        | One stored fact, with its provenance and its evidence                                      |
| evidence           | The owner's quote that backs a memory item                                                 |
| definitions        | The owner's persona, jobs and policy seed                                                  |
| definitions source | Where nixie reads the definitions from, such as a git repo, a local path or bucket storage |
| connector          | nixie's code for one outside service                                                       |
| outside server     | Any MCP server that is not part of nixie's code                                            |
| coding adapter     | How nixie starts and steers coding sessions, with atc first                                |
| outside agent      | An agent nixie supervises that runs under its own rules                                    |
| task board         | The data on every task: status, last update and what it waits on                           |
| dashboard          | The view of the task board in the client                                                   |
| live view          | The full view of the system, including finished tasks and what each did                    |
| event log          | nixie's record of everything it does                                                       |
| record             | One entry in the event log                                                                 |
| sandbox adapter    | How nixie runs sandboxed work, with imp as the reference and containers as an alternative  |
| imp                | A sandboxed microVM, from the imp project, that runs workers and coding sessions           |
