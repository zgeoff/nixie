# The computer

- **Status:** draft
- **Work items:**
  [the assistant has a computer of its own](https://linear.app/zgeoff/issue/GEO-2730), then
  [its own email and accounts](https://linear.app/zgeoff/issue/GEO-2731), which sign in through its
  browser

The assistant's browser and shell are built, as
[the computer](../../architecture/connectors/computer.md) describes. This design holds what is still
open.

## Contracts

- `computer.read` and `computer.read_file` take a `part`, and page a long text as `web_fetch` does.
  Until then, `computer.read` stores the page, and `web_fetch` with the page ID reads its parts.
- `computer.write_file` takes `from: { image }` or `from: { file }`, which copies an image or a
  `code.run` file into the shell. It returns `voids`, the action IDs of the waiting `computer.run`
  calls that the write cancelled. Until then, a waiting run returns `FILES_CHANGED` when it starts.
- A waiting `computer.run`'s pending result tells the assistant that a write before the decision
  cancels it.
- `computer.open` takes `link`, the `L` ID of a link on a stored page, as `web_fetch` does.
- `computer.download` returns `FILLED_TAB` for a tab that holds a field the sign-in broker filled.
- The web client has a reset for the browser, the shell or both. It calls the computer's reset,
  which destroys the sandbox.

## Constraints

- When a wake keeps the browser's memory, the tabs and their IDs survive the sleep. Until a spike
  shows that a wake does, every wake is a restart.
- A release replaces a sandbox whose spec changed, and a queued act on one of its tabs returns
  `TAB_GONE`.
- A queued act re-reads the tab's URL when it runs, and returns `destinations_changed` when the host
  differs from the one the decision checked. The guest's `expectURL` check covers it today.

## Out of scope

- Signing in. [Email and accounts](https://linear.app/zgeoff/issue/GEO-2731) adds the sign-in
  broker.
- A shell session that persists between `computer.run` calls.
- A desktop with a window manager, and screen sharing.

## Open questions

- **Does a wake keep the browser's memory?** A spike settles it.
- **Do the sizes and the idle timeouts fit?** A spike in a sandbox settles them.
