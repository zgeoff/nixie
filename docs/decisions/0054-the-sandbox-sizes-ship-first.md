# 0054: The sandbox sizes ship before the runtime's reserved-memory work

- Date: 2026-11-11
- Status: decided

## Decision

The smaller sandbox sizes ship in the first milestone. They never wait for the sandbox runtime's
work on reserved memory.

## Why

- The sizes only lower what nixie asks of the runtime, so they need nothing from its reservation
  work.

## Rejected alternatives

| Option                                    | Why not                                                   |
| ----------------------------------------- | --------------------------------------------------------- |
| the sizes after the runtime's reservation | the sizes would wait for a check that nobody can schedule |

## Consequences

- The sizes are accepted on a day of use with no memory kill, so they ship with a signal for one:
  [a wrapper logs each memory kill](0056-a-wrapper-logs-each-memory-kill.md).
