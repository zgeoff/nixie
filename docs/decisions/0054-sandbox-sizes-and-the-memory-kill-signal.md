# 0054: Sandbox sizes and the memory-kill signal

- Date: 2026-11-11
- Status: decided
- Design: [the sandbox sizes](../design/queue/sandbox-sizes.md)

The smaller sandbox sizes ship in the first milestone (GEO-2417). They do not wait for the sandbox
runtime's work on reserved memory. A signal for a memory kill ships with them.

These choices settle the signal:

1. **One read on the port.** The sandbox port gains one read of the guest's count of memory kills.
2. **A wrapper reads it.** A wrapper around the adapter reads the count after each guest program
   ends. No caller changes.
3. **Log lines.** The wrapper writes one log line for a kill, and one for a read it could not make.
   Neither is a record in the event log.

## Why

- The sizes only lower what nixie asks of the runtime, so they need nothing from its reservation
  work.
- The sizes are accepted on a day of use with no memory kill. A guest killed for memory looks like
  any other failed turn, step or fetch, so nixie's log needs an entry that you can count.
- A read that fails gets a line of its own, so an end that nixie could not judge never counts as "no
  kill".
- A log line cannot stop an earlier release from reading the event log, so the signal adds nothing
  to a rollback under [0049](0049-milestone-deploys-and-the-rollback-target.md).

## Alternatives

- **No signal.** The acceptance of the sizes could not be read from nixie's log.
- **A record that the sandbox sends.** A killed guest cannot always report.
- **A watch in each caller.** Each caller that starts a guest program carries the watch, and a
  caller that leaves it out goes unwatched.
- **The sizes after the runtime's reservation work.** The sizes then wait for a check that nobody
  can schedule.

## Consequences

- The count of kills covers only as many days as a deployment keeps nixie's log.
- A second sandbox adapter gives its own count, or gives none.
