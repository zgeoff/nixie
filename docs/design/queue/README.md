# The queue design

This folder holds the designs for work that nixie has not built yet. Each one exists because two or
more pieces of work build on a contract it defines. Each design states that contract as code
sketches, constraint bullets and a diagram, and lists the Linear issues that build on it. Read the
issue first, then the sections of the design it links.

Each design is a draft until the owner approves it, and it lists the questions still open. When the
work is built, its lasting facts move to [`docs/architecture/`](../../architecture/), and the design
is deleted.

| Area            | Designs                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------- |
| Memory writes   | [no built-in memory task](no-built-in-memory-tasks.md)                                        |
| Tasks           | [the coding session runner](coding-session-runner/README.md)                                  |
| Definitions     | [mail and calendar polls](mail-and-calendar-polls.md)                                         |
| The computer    | [the rest of the browser and the shell](computer.md), [the desktop and take-over](desktop.md) |
| Web             | [the hop gate](hop-gate.md)                                                                   |
| Notebook        | [notes, links and walks](notebook.md)                                                         |
| Approvals       | [the approval record](../../architecture/policy/approvals.md)                                 |
| Operations      | [the pause after a restore](pause.md)                                                         |
| Model harnesses | [the turn-input log](turn-input-log.md)                                                       |
| Policy          | [the decision point cutover](decision-point-cutover.md)                                       |
| Connections     | [Google connections](google-connections.md)                                                   |
| Google tools    | [Gmail, Calendar and Drive](gmail-calendar-drive-tools.md)                                    |
| MCP servers     | [the MCP proxy build](mcp-proxy-build.md)                                                     |
| Channels        | [the push notice](push-notice.md)                                                             |
| Devices         | [the camera, the speaker and the microphone](devices.md)                                      |

Work that no design covers, such as the port rules and the voice and typing design sessions, lives
in its Linear issue alone. The decision records these designs follow are in
[`docs/decisions/`](../../decisions/).
