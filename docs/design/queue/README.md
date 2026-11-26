# The queue design

This folder holds the designs for work that nixie has not built yet. Each design is the contract
that two or more pieces of work build on, so those pieces fit together when different people or
agents build them. A contributor or agent who holds the Linear issue for such work reads the issue
first, then the sections of the design that the issue links. A reader with no issue finds a design
by area in the table below.

A design is written as code sketches, constraint bullets and a diagram, and it lists the Linear
issues that build on it. It stays a draft until the owner approves it, and it lists the questions
still open. Every design in this folder has a row in the table.

When the work is built, move the design's lasting facts to
[`docs/architecture/`](../../architecture/) and delete the design. A built design left here would
describe code that has since changed, and a reader could not tell it from one still to build.

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
| Google tools    | [the Google tool rules and the Gmail tools not built yet](gmail-calendar-drive-tools.md)                                                |
| Channels        | [the push notice](push-notice.md)                                                                                                       |
| Devices         | [the camera, the speaker and the microphone](devices.md), [client devices](client-devices.md)                                           |
| Accounts        | [accounts and sign-in](accounts.md), [the wallet](wallet.md), [mail and phone](mail-and-phone.md)                                       |

Work that no design covers, such as the port rules and the voice and typing design sessions, lives
in its Linear issue alone, and so has no row here. The decision records these designs follow are in
[`docs/decisions/`](../../decisions/).
