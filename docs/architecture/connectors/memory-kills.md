# Memory kills

The server logs a line each time a guest's kernel kills one of the guest's processes because the
guest used more memory than its sandbox's size. Without that line, nixie sees only the result, a
turn, a task step or a web fetch that failed, and cannot tell a memory kill from any other failure.
Each sandbox reports the guest's count of memory kills, and a watcher reads that count after each
guest program ends. The [glossary](../../glossary.md#connectors-and-sandboxes) defines a guest, a
guest program, an imp and the test sandbox. [Sandboxes](./sandboxes.md) covers the sandbox adapters,
how a command runs, and the [size](./sandboxes.md#sizes) of each sandbox.

## Reading the count

Each sandbox object that an adapter returns has a `readMemoryKills` method. It returns one of these
results:

| Result        | Meaning                                                                                |
| ------------- | -------------------------------------------------------------------------------------- |
| a count       | how many processes the guest's kernel has killed for memory since the guest booted     |
| `unsupported` | the adapter or the guest keeps no count                                                |
| `failed`      | the sandbox is gone, the adapter's backend refused the read, or the read was cut short |

The count never falls while the guest stays booted. The read never rejects, and the caller can pass
an abort signal to cut it short. Each adapter reads the count its own way:

- **The imp adapter** runs one command in the guest that prints the guest's `memory.events` file,
  and takes the number on its `oom_kill` line. A guest with no such file or line gives
  `unsupported`. The read wakes a sleeping imp, as any command does. The count survives a sleep,
  because the sleep saves the guest's whole memory, its kernel's counters included. A guest that
  boots again, such as after an imp crash, starts its count at 0.
- **The test sandbox** reads the file `.memory-kills` at the root of the guest's filesystem, which
  is the sandbox's own directory on the host. It reads the file from the host and starts no process,
  so it also reads a sleeping sandbox. A missing file gives a count of 0, and a file that holds
  anything but a whole number gives `failed`. A test sets the count with `writeMemoryKills` from
  `@heynixie/sandbox/test-utils`.
- **Every other adapter** returns `unsupported`.

## Watching for kills

### Where the watcher sits

At start, the server wraps its sandbox adapter in `watchMemoryKills` from the sandbox module. The
server wraps either adapter: the one it builds from its configuration, or one that the program
starting the server passes in as the `createSandboxAdapter` option. Every part of the server gets
the wrapped adapter and calls the same methods on it as on the adapter itself. The watcher logs
`sandbox.memory_watch` at `info` when it wraps the adapter, so the log shows that memory kills are
watched.

### When the watcher reads

A sandbox runs a command with `exec` or `spawn`. `exec` runs a command to its end and returns its
output. `spawn` starts a long-lived guest program, such as the conversation's turn, and returns a
stream whose `exit` promise settles when the program ends, and whose `stop()` ends the program
early.

The watcher reads the count once each time a program that `spawn` started ends, for any cause: a
clean exit, a failure or a `stop()`. It never reads after an `exec`. Code that runs a guest program
through `exec` reads the count itself. The watcher never looks at the exit code or the signal,
because the `SIGKILL` that ends a stopped program looks the same as a memory kill. `exit` and
`stop()` resolve with the adapter's own values, and never wait for the read.

The read runs in the background. Only the next `spawn`, `suspension.sleep` and `destroy` on the same
sandbox wait for it. A sandbox therefore never sleeps or goes away while its count is unread. A web
fetch returns its reply as soon as its program ends, and destroys its sandbox afterwards, so the
read delays only that destroy.

### What the watcher compares

The watcher keeps each sandbox's last count in memory, keyed by sandbox ID, because `read` and
`list` return a new object for the same sandbox. A sandbox that the watcher's `create` returned
starts with a last count of 0.

A sandbox from `read` or `list`, such as one that an earlier server process created, has no last
count yet, so the watcher reads it once before its first `spawn`:

- A count of 0 becomes the last count, with no line.
- A count above 0 becomes the last count, and the watcher logs a `no_baseline` line, because some of
  those kills may have happened since the last read of the earlier process.
- `unsupported` or `failed` leaves the sandbox with no last count, and the watcher logs nothing
  until the first end.

After each end, the watcher compares the new read with the last count and logs at most one line. A
count becomes the new last count; `unsupported` and `failed` leave the last count as it was.

| The read                                      | Line                          | Level   | Field                     |
| --------------------------------------------- | ----------------------------- | ------- | ------------------------- |
| a count above the last count                  | `sandbox.memory_kill`         | `error` | `kills`: the rise         |
| a count equal to the last count               | none                          |         |                           |
| a count below the last count                  | `sandbox.memory_kill_unknown` | `warn`  | `reason`: `counter_reset` |
| a count, for a sandbox with no last count     | `sandbox.memory_kill_unknown` | `warn`  | `reason`: `no_baseline`   |
| `unsupported`                                 | `sandbox.memory_kill_unknown` | `warn`  | `reason`: `unsupported`   |
| `failed`, or no answer within `readTimeoutMs` | `sandbox.memory_kill_unknown` | `warn`  | `reason`: `read_failed`   |

A kill between 2 programs, or during a file copy, shows on the line of the next program that ends,
because the rise counts from the last read. A sandbox that had a kill under an earlier server
process logs `no_baseline` again after every restart, because its count stays above 0. A count below
the last count means the guest booted again between 2 reads. `readTimeoutMs` is an option of
`watchMemoryKills`, and the server leaves it at its default.

The watcher logs a `warn` line for every end it cannot judge, and never treats such an end as one
with no kill. An adapter that returns `unsupported` therefore gives one `warn` line per end. The
`kills` of a day's `sandbox.memory_kill` lines add up to the kills that the watcher saw that day.
Kills behind a `warn` line are not in that sum, so a day with no `sandbox.memory_kill` line and no
`warn` line is a day with no memory kill.

The watcher compares and stores each count in one synchronous step, and runs the reads of one
sandbox one after another. So 2 programs that end together on one sandbox give one line for one
kill.

### What a line holds

Each line also holds `ended`, `kind`, `memoryMiB` and `sandboxID`. `kind` and `memoryMiB` come from
the sandbox's spec, and together they identify the sandbox's size. `ended` is the work the guest
program did, taken from the sandbox's kind: `turn` for the conversation's sandbox, `fetch` for a web
fetch's sandbox, and `step` for every other sandbox. The conversation's sandbox also runs the
conversation's summary and its purge, and those ends show as `turn` too.

A line never holds a task ID, a step key, guest output, a URL, a message or a prompt. The lines go
to the server's log only, and the watcher writes no record to the [event log](../core/event-log.md).
