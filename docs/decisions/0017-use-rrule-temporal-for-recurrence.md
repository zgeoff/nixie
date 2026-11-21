# 0017: nixie uses rrule-temporal for recurrence and owns time zone mapping

- Date: 2026-11-21
- Status: decided

## Decision

nixie expands recurrence with the `rrule-temporal` library, behind one function in the triggers
module. The library expands local wall times only: nixie builds the rule from the structured
`repeat` of a schedule, gives the rule no time zone, and maps each local time onto the clock with
its own rules:

- A local time that the clock skips fires at the first instant after the gap.
- A local time that the clock shows twice fires at the first of the two.

Nix never writes recurrence rule text. The library has no runtime dependencies and runs on Bun's
built-in Temporal.

## Why

- The patterns a schedule needs, such as every 2 weeks, the last Friday of a month or the 31st in
  the months that have one, are the recurrence rules of RFC 5545. The library implements them, so
  nixie writes none of that calendar code.
- With a time zone, the library drops a fire whose local time falls in a spring-forward gap. A daily
  02:30 in Australia/Sydney does not fire on 4 October 2026. A reminder that vanishes on one day a
  year is a fault nixie cannot accept, and it already has a rule for the gap.
- Expanding floating local times avoids the fault, and nixie's mapping keeps the behaviour of the
  schedules it already stores.

## Rejected alternatives

| Option                                   | Why not                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| the library with a time zone             | It drops a fire that falls in a spring-forward gap.                       |
| nixie's own calendar code for each field | It repeats the rules of RFC 5545, and every pattern is another edge case. |
