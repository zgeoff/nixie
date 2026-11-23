# The desktop and take-over

- **Status:** draft
- **Work item:** [the Telegram push notifier](https://linear.app/zgeoff/issue/GEO-1812)

The desktop, watching and take-over are built, as
[the computer](../../architecture/connectors/computer.md) describes. One part remains: an ask to
take over the computer reaches you when no client is open.

## Contracts

A `computer.handover_asked` record also goes out as a [push notice](push-notice.md), so an ask
reaches you with no client open. The notice follows the push notice's rules: it holds a count, a
fixed sentence and a link to the client, and never the ask's reason.

## Out of scope

- Audio from the desktop.
- Copy and paste between your machine and the desktop.
- Files dragged in from your machine.
- A desktop on a phone-sized screen.
