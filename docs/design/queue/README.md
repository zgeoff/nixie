# The queue design

This folder holds the designs for work that nixie has not built yet. Each design covers a contract
that two or more pieces of work build on. Write the contract as code sketches, constraint bullets
and a diagram, and list the Linear issues that build on it. Read the issue first, then the sections
of the design it links.

Treat each design as a draft until the owner approves it, and list the questions still open in it.
When the work is built, move its lasting facts to [`docs/architecture/`](../../architecture/) and
delete the design.

| Area            | Designs                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Memory writes   | [no built-in memory task](no-built-in-memory-tasks.md)                                                                                  |
| Tasks           | [the coding session runner](coding-session-runner/README.md)                                                                            |
| Definitions     | [mail and calendar polls](mail-and-calendar-polls.md)                                                                                   |
| The computer    | [the rest of the browser and the shell](computer.md), [the desktop and take-over](desktop.md)                                           |
| Web             | [the hop gate](hop-gate.md)                                                                                                             |
| Approvals       | [the approval record](../../architecture/policy/approvals.md)                                                                           |
| Model harnesses | [the turn-input log](turn-input-log.md)                                                                                                 |
| Policy          | [the decision point cutover](decision-point-cutover.md), [CEL conditions on rules](cel-rules.md), [provider limits](provider-limits.md) |
| Mail            | [mail and wake rules](mail/README.md)                                                                                                   |
| Connections     | [Google connections](google-connections.md)                                                                                             |
| Google tools    | [Gmail](gmail-calendar-drive-tools.md)                                                                                                  |
| Channels        | [the push notice](push-notice.md)                                                                                                       |
| Devices         | [the camera, the speaker and the microphone](devices.md), [client devices](client-devices.md)                                           |
| Accounts        | [accounts and sign-in](accounts.md), [the wallet](wallet.md), [mail and phone](mail-and-phone.md)                                       |

Work that no design covers, such as the port rules and the voice and typing design sessions, lives
in its Linear issue alone. The decision records these designs follow are in
[`docs/decisions/`](../../decisions/).
