# The queue design

Designs for work that nixie has not built yet live in this folder. The owner opens a design when two
or more pieces of work build on the same contract, so the pieces fit together when different people
or agents build them. Work that one piece builds alone needs no design here. When you hold the
Linear issue for such work, read the issue first, then the sections of the design that it links.
With no issue, find the design by area in the table below.

Write a design as code sketches, constraint bullets and a diagram. List the Linear issues that build
on it and the questions still open. Start the design with a `Status` line: `draft` until the owner
approves it, then `agreed`. Give every design in this folder a row in the table.

When the work is built, move the design's lasting facts to
[`docs/architecture/`](../../architecture/) then delete the design and its row in the table. A built
design left here would describe code that has since changed, and a reader could not tell it from one
still to build. When only part is built, move the built part's facts and trim the design to what is
still to build.

| Area            | Designs                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------- |
| Features        | [feature switches](feature-switches.md)                                                       |
| Memory writes   | [no built-in memory task](no-built-in-memory-tasks.md)                                        |
| Tasks           | [the coding session start](coding-session-runner.md)                                          |
| Definitions     | [mail and calendar polls](mail-and-calendar-polls.md)                                         |
| The computer    | [the rest of the browser and the shell](computer.md), [the desktop and take-over](desktop.md) |
| Web             | [the hop gate](hop-gate.md)                                                                   |
| Vault           | [trusted places](trusted-places.md), [locked entries](locked-entries.md)                      |
| Forgetting      | [one way to forget](erasure.md)                                                               |
| Model harnesses | [the turn-input log](turn-input-log.md)                                                       |
| Policy          | [the decision point cutover](decision-point-cutover.md)                                       |
| Mail            | [mail and wake rules](mail/README.md)                                                         |
| Connections     | [Google connections](google-connections.md)                                                   |
| Google tools    | [the Google tool rules and the Gmail tools not built yet](gmail-calendar-drive-tools.md)      |
| Channels        | [the push notice](push-notice.md)                                                             |
| Devices         | [the camera, the speaker and the microphone](devices.md)                                      |
| Accounts        | [accounts and sign-in](accounts.md), [the wallet](wallet.md)                                  |

Work that no design covers, such as the port rules and the voice and typing design sessions, lives
in its Linear issue alone and has no row here. The decision records these designs follow are in
[`docs/decisions/`](../../decisions/).
