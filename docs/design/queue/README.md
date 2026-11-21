# The queue design

This folder holds the designs for work that nixie has not built yet. Each one exists because two or
more pieces of work build on a contract it defines. Each design states that contract as code
sketches, constraint bullets and a diagram, and lists the Linear issues that build on it. Read the
issue first, then the sections of the design it links.

Each design is a draft until the owner approves it, and it lists the questions still open. When the
work is built, its lasting facts move to [`docs/architecture/`](../../architecture/), and the design
is deleted.

| Area                | Designs                                                                                                                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory index        | [labels and revision](memory-labels.md), [`memory.recall`](memory-recall.md), [the index at an opening](memory-index.md)                                                                                                                  |
| Memory writes       | [no built-in memory task](no-built-in-memory-tasks.md)                                                                                                                                                                                    |
| Tasks               | [task runs and their reports](task-runs/README.md), [thread reads](thread-reads.md), [the coding session runner](coding-session-runner/README.md)                                                                                         |
| Definitions         | [the format](task-definition-format.md), [the task of a definition](definition-tasks.md), [triggers and schedules](triggers.md), [definitions from chat](definitions-from-chat.md), [mail and calendar polls](mail-and-calendar-polls.md) |
| Sandboxes           | [sizes](sandbox-sizes.md), [the memory-kill signal](memory-kill-signal.md), [the image set](sandbox-image-set.md)                                                                                                                         |
| The computer        | [the browser and the shell](computer.md)                                                                                                                                                                                                  |
| Web                 | [the `hidden` field](tool-hidden-field.md), [the hop gate](hop-gate.md)                                                                                                                                                                   |
| Notebook            | [pages, links and walks](notebook.md)                                                                                                                                                                                                     |
| Images              | [drawing and editing](images.md)                                                                                                                                                                                                          |
| Approvals           | [the approval record](../../architecture/policy/approvals.md)                                                                                                                                                                             |
| Operations          | [the backup pair](backup-pair.md), [the pause after a restore](pause.md), [the rollback check](rollback-check.md)                                                                                                                         |
| Model harnesses     | [the harness boundary](harness-boundary.md), [the tool-call wait](tool-call-wait.md), [the turn-input log](turn-input-log.md)                                                                                                             |
| Policy              | [the decision point cutover](decision-point-cutover.md)                                                                                                                                                                                   |
| Moments and forgets | [redaction](redaction.md)                                                                                                                                                                                                                 |
| Connections         | [Google connections](google-connections.md)                                                                                                                                                                                               |
| Google tools        | [Gmail, Calendar and Drive](gmail-calendar-drive-tools.md)                                                                                                                                                                                |
| MCP servers         | [the MCP proxy build](mcp-proxy-build.md)                                                                                                                                                                                                 |
| Channels            | [the push notice](push-notice.md)                                                                                                                                                                                                         |
| Devices             | [devices and their capabilities](devices.md)                                                                                                                                                                                              |
| Live view           | [dashboard states, fires and filters](live-view-dashboard.md)                                                                                                                                                                             |

Work that no design covers, such as the port rules and the voice and typing design sessions, lives
in its Linear issue alone. The decision records these designs follow are in
[`docs/decisions/`](../../decisions/).
