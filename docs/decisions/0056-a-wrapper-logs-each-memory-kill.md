# 0056: A wrapper around the sandbox adapter logs each memory kill

- Date: 2026-11-11
- Status: decided

## Decision

The sandbox port gains one read of a guest's count of memory kills. A wrapper around the sandbox
adapter reads the count after each guest program ends, and writes one log line for a kill and one
for a read it could not make. Neither line is a record in the event log.

## Why

- A guest killed for memory looks like any other failed turn, step or fetch, so nixie's log needs a
  line that can be counted.
- The host reads the count, because a killed guest cannot always report.
- One wrapper watches every guest program, and no caller changes.
- A read that fails gets a line of its own, so an end that nixie could not judge never counts as no
  kill.
- A log line cannot stop an earlier release from reading the event log, so the signal adds nothing
  to a rollback under [0049](0049-milestone-deploys-and-the-rollback-target.md).

## Rejected alternatives

| Option                        | Why not                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| no signal                     | the acceptance of the sizes could not be read from nixie's log |
| a record that the guest sends | a killed guest cannot always report                            |
| a watch in each caller        | a caller that leaves the watch out goes unwatched              |

## Consequences

- The count of kills covers only as many days as a deployment keeps nixie's log.
- A second sandbox adapter gives its own count, or gives none.
