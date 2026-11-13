# The queue design

This folder holds the designs for work that nixie has not built yet. Each one exists because two or
more pieces of work build on a contract it defines. Each design states that contract as code
sketches, constraint bullets and a diagram, and lists the Linear issues that build on it. Read the
issue first, then the sections of the design it links.

Each design is a draft until the owner approves it, and it lists the questions still open. When the
work is built, its lasting facts move to [`docs/architecture/`](../../architecture/), and the design
is deleted.

| Area                | Designs                                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory index        | [labels and revision](memory-labels.md), [`memory.recall`](memory-recall.md), [the index at an opening](memory-index.md), [what a turn brings](memory-turn-push.md)                                                  |
| Memory writes       | [no built-in memory task](no-built-in-memory-tasks.md)                                                                                                                                                               |
| Tasks               | [task runs and their reports](task-runs/README.md), [the brief and the message envelope](task-brief-and-envelope.md)                                                                                                 |
| Definitions         | [the format](task-definition-format.md), [the task of a definition](definition-tasks.md), [triggers and schedules](triggers.md), [definitions from chat](definitions-from-chat.md), [the views](definition-views.md) |
| Sandboxes           | [sizes](sandbox-sizes.md), [the memory-kill signal](memory-kill-signal.md), [the image set](sandbox-image-set.md)                                                                                                    |
| Web                 | [the `hidden` field](tool-hidden-field.md), [short IDs in tool records](short-ids-in-tool-records.md), [the page fetch flow](page-fetch-flow.md), [the hop gate](hop-gate.md), [secret URLs](secret-url-refusal.md)  |
| Operations          | [the backup pair](backup-pair.md), [the pause after a restore](pause.md), [seeders](seeders.md)                                                                                                                      |
| Model harnesses     | [the harness boundary](harness-boundary.md), [the tool-call wait](tool-call-wait.md), [the turn-input log](turn-input-log.md)                                                                                        |
| Approvals           | [passkeys](passkeys.md)                                                                                                                                                                                              |
| Moments and forgets | [redaction](redaction.md), [the evidence purge](evidence-purge.md)                                                                                                                                                   |

Work that no design covers, such as the port rules and the voice and typing design sessions, lives
in its Linear issue alone. The decision records these designs follow are in
[`docs/decisions/`](../../decisions/).
