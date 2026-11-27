# The coding session runner, the start that is not live yet

- **Status:** agreed
- **Work items:**
  [make the atc start live once the harness probes run](https://linear.app/zgeoff/issue/GEO-2868)

This doc is for a contributor or agent who picks up the work item above. It says what is left of the
coding session runner and what the finished work keeps true.

The coding runner, its tools, the `coding-atc` adapter and the supervision of a session in the live
view are built. For the runner, read [Coding tasks](../../architecture/core/coding-tasks.md), and
for the adapter, read [the atc adapter](../../architecture/connectors/coding-atc.md). The one part
still open is the `coding.start` call for an atc coding task in a real deployment. The work item
holds the steps for the harness probes and for `oneOfStartHarnesses`.

## Start in a real deployment

The start is unreachable in a real deployment, because `oneOfStartHarnesses` stays empty until the
atc harness probes run. Tests cover the start, because a test build reaches the gateway double
through `NIXIE_TEST_ATC_URL`.

## Constraints

- The work is done when the probes run, `oneOfStartHarnesses` lists the atc harness, and a start
  works in a real deployment.
- A start in a real deployment still meets your rules as `coding_start`, the effect that every
  start, join and stop of a started session declares. A start acts on a coding session outside
  nixie, which nixie does not see call by call, so it needs an effect of its own. See
  [the policy of a coding task](../../architecture/core/coding-tasks.md#policy).

## Out of scope

- A built-in adapter that runs a session in an [imp](../../glossary.md). It gets its own adapter ID
  and its own design.
