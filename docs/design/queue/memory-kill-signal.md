# The memory-kill signal

When a guest uses more memory than its sandbox's size, the guest's kernel kills one of the guest's
processes. nixie sees only a turn, a step or a fetch that failed, with no cause. In the design,
nixie reads each guest's count of such kills after each guest program ends, and writes a log line
when the count rose. You can then count the memory kills of a day from nixie's log. The acceptance
of [the sandbox sizes](sandbox-sizes.md) is a day with none.
[Decision 0054](../../decisions/0054-sandbox-sizes-and-the-memory-kill-signal.md) records the
choice.

The sketches in `sketches/sandboxes/` hold the code shapes and the exact texts, and this doc holds
the rules. Each `(open: <name>)` mark has an item in [the open list](open/sandboxes.md), which links
the tracker issue.

Terms this doc uses:

- A guest is the system inside one sandbox: its kernel and its processes.
- A memory kill is the kernel's kill of one guest process because the guest ran out of memory.
- A guest program is a program that nixie starts in a guest: the guest turn, the sandbox check, the
  guest purge, the guest summary or the fetcher.
- The count is a guest's number of memory kills since the guest booted.
- The watcher is the wrapper around the sandbox adapter that reads the count.
- The count read is one call of `readMemoryKills`, the method that returns the count.
- A part is one named entry in the list of things that the server starts, in order.
- The [glossary](../../glossary.md) holds every other term, such as imp and sandbox adapter.

## Built

This section is what the code does. Each section after it is the design.

- The `Sandbox` interface starts a program in 2 ways: `exec` runs it to its end, and `spawn` returns
  a stream with an `exit` promise and a `stop()` method. Both ways give the program's exit code and
  signal, and nothing else about its end.
- A stop that nixie asks for ends in `SIGKILL` after its grace.
- The kernel picks which process it kills for memory. In the conversation's guest, that process is
  usually the CLI child, which holds 183 to 219 MiB. After a kill of that child, the process that
  nixie started exits by itself, sends a `failed` frame, or finishes the turn.
- The guest's `memory.events` file holds an `oom_kill` line with the count. A guest has one count.
- nixie starts each guest program through `spawn`.
- A fetch awaits the fetcher's exit under the fetch's time limit. It destroys its sandbox in the
  background, and the fetch's reply does not wait for the destroy.
- The sandbox runtime sleeps an idle imp on its own. The imp adapter wakes an imp inside `spawn`,
  `exec` and `toolRoute`.
- Each call of `read` or `list` on the adapter returns a fresh object, so 2 objects can stand for
  one sandbox.
- The `sandbox_adapter` part in the server builds the adapter. It uses the server's own
  `createSandboxAdapter`, or the function passed in as the `createSandboxAdapter` option.
- nixie writes each log line as JSON with an `event` field.

## The read of the count

The `Sandbox` interface has one method for the count, `readMemoryKills`. Shape:
[the read and its 3 results](sketches/sandboxes/02-types.ts), section B of that file.
[Port rules](port-rules.md) owns the rules for any port.

- `readMemoryKills` never rejects. It returns a count, `unsupported` or `failed`.
- The imp adapter runs one command in the guest that prints the `memory.events` file, through the
  adapter's own exec. An `oom_kill` line gives the count. A missing file or a missing line gives
  `unsupported`. A rejected exec gives `failed`.
- The file's path and the parser are in the imp adapter. `ImpPort`, an interface inside the imp
  adapter, has no method for the count read.
- A count read of a sleeping imp wakes the imp, as any exec does.
- The test sandbox reads one whole number from the guest file `/.memory-kills`. When the file is
  absent, the count is 0. `writeMemoryKills` in the sandbox module's test utils writes the file, and
  a stub guest can write it too.
- The fake runtime in the imp adapter's test utils takes the count from the fake runtime's own
  `memoryKills` field. The fake runtime never runs the adapter's command on the test's host.
- Any other sandbox adapter, when one is written, returns `unsupported` or reads its own count.

## The watcher

The watcher is the function `watchMemoryKills`. It takes a sandbox adapter and returns one with the
same interface. Shape: [the watcher's signature](sketches/sandboxes/02-types.ts), section C. Flow:
[the watcher for one guest program](sketches/sandboxes/03-flow.ts), section B.

- The `sandbox_adapter` part applies the watcher once, around whichever adapter it built. Code that
  calls the adapter calls the same methods with or without the watcher.
- The watcher holds, in memory, the last count that it read for each sandbox. For a sandbox that the
  watcher created, the last count starts at 0.
- After nixie restarts, the watcher meets sandboxes that it did not create. It reads the count of
  such a sandbox once, ahead of that sandbox's first `spawn` `(open: baseline line)`.
- When a guest program ends, for any cause, the watcher changes nothing in `exit` or `stop()`. Both
  settle with the adapter's own values.
- The watcher starts a count read when the guest program ends. The count read has a limit, the
  `readTimeoutMs` option, with a default of 2000 ms. A count read that exceeds the limit counts as
  `failed`. A count read that fails never changes an exit.
- The watcher holds the pending read under the sandbox's ID, because 2 objects can stand for one
  sandbox. The wrapped `destroy`, the wrapped `suspension.sleep` and the next `spawn` on that ID
  each wait for the pending read. So the read happens ahead of the destroy or the sleep.
- A fetch's reply does not wait for the read. The read happens in the background, ahead of the
  background destroy.
- The watcher compares the count with the last count and stores the count in one synchronous step.
  When 2 guest programs end together on one sandbox, one kill gives one line.
- The watcher writes at most one line for one end of a guest program.
- The watcher never looks at the exit's code or signal. The `SIGKILL` of a stop is the signal of a
  memory kill too. After a memory kill of a child process, the watched process can exit with code 0.
- The watcher starts a count read after a `spawn` and never after an `exec`. If code ever starts a
  guest program through `exec`, that code makes its own count read.
- The watcher does nothing when an imp wakes. It cannot see every sleep and wake, because the
  sandbox runtime sleeps an idle imp on its own and the adapter wakes an imp inside its own calls
  `(open: count across sleep)`.

## The log lines

The watcher writes 3 log lines. Shape:
[the 3 lines, with their levels, fields and reasons](sketches/sandboxes/02-types.ts), section C.

| Line                          | nixie writes it when                           |
| ----------------------------- | ---------------------------------------------- |
| `sandbox.memory_watch`        | the server applies the watcher                 |
| `sandbox.memory_kill`         | a guest program ends and the count rose        |
| `sandbox.memory_kill_unknown` | a guest program ends and nixie cannot judge it |

- nixie writes exactly one `sandbox.memory_kill` line for a count that rose, even when the turn, the
  step or the fetch succeeded.
- nixie writes no line when the count is the same. That covers a stop that nixie asked for, a guest
  program's own exit, a model API failure, a time limit and a lost connection.
- A `sandbox.memory_kill_unknown` line holds a reason. An end that nixie cannot judge never counts
  as an end with no kill.
- The 3 lines are log lines. nixie writes no record to the event log for a memory kill, so every
  release reads the same event log and a rollback needs no step.
- A line holds the sandbox's ID. It holds no task ID and no step key.
- A line's `ended` field comes from the sandbox's kind. A summary or a purge on the conversation's
  sandbox therefore shows as `turn`.
- The `ended` field is `turn` for the kind `conversation`, `fetch` for the kind `fetch`, and `step`
  for every other kind.
- A line's `kind` and `memoryMiB` come from the sandbox's spec. The pair identifies the row of
  [the size table](sandbox-sizes.md#the-size-table).
- A line holds no guest output, URL, message or prompt.

How each case shows:

- A memory kill that happens between 2 guest programs, or during a file copy, shows on the line for
  the next guest program that ends.
- When the whole guest stops, such as a crash of the imp, the read fails and the reason is
  `read_failed`. nixie writes no `sandbox.memory_kill` line for it.
- When a guest boots again between 2 reads, its count starts at 0. A wake that falls back to a cold
  boot is one such case. A count below the last count gives the reason `counter_reset`.
- A count that climbs back to exactly the last count shows as no kill.
- When nixie stops between the end of a guest program and the read, the kill is on no line. After
  the restart, the first read of that sandbox is above 0, and the reason is `no_baseline`. So the
  kill shows as unknown `(open: baseline line)`.
- A sandbox that had a memory kill under a previous process of nixie gives one `no_baseline` line
  after each restart of nixie, because each restart empties the watcher's last counts.
- An adapter that returns `unsupported` gives one `sandbox.memory_kill_unknown` line for each end of
  a guest program `(open: unsupported lines)`.

## The day's check

The acceptance of the sandbox sizes is one day of use after their release with no memory kill.
Commands: [the day's check](sketches/sandboxes/01-usage.ts), section C.

- You, or an agent that you ask to check the release, read the deployment's log for that day. The
  check makes no request to nixie.
- The day starts ahead of the start of the release's nixie, so the day's log holds that start.
- The reader first counts the `sandbox.memory_watch` lines. With none, the nixie of that day never
  applied the watcher, and a count of 0 kills proves nothing.
- One `sandbox.memory_kill` line fails the day.
- The reader reads each `sandbox.memory_kill_unknown` line and writes down its cause. Such a line
  does not fail the day. A day on which every end gave `read_failed` shows nothing about memory.
- The check covers only as many days as the deployment stores nixie's log.
- The acceptance also asks that the sandbox runtime refused no create and no wake of one of nixie's
  imps. A refusal is in the sandbox runtime's log on the host, and never in nixie's log.

## Not in scope

- A record kind in the event log, a migration, a tool or a config key for the signal.
- A check of the count in each piece of code that starts a guest program.
- A design for a sandbox runtime whose sleep resets the count.
- The read of the sandbox runtime's log on the host.
