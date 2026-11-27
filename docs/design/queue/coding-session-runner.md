# The coding session runner, the start that is not live yet

- **Status:** agreed
- **Work items:**
  [make the atc start live once the harness probes run](https://linear.app/zgeoff/issue/GEO-2868)

The coding runner, its tools, the `coding-atc` adapter and the supervision of a session in the live
view are built. [Coding tasks](../../architecture/core/coding-tasks.md) describes the runner and
[the atc adapter](../../architecture/connectors/coding-atc.md) describes the adapter. This design
holds the one part that is still open: the start of an atc coding task in a real deployment.

## Start in a real deployment

The start is unreachable in a real deployment, because `oneOfStartHarnesses` stays empty until the
atc harness probes run. A test build reaches the gateway double through `NIXIE_TEST_ATC_URL`, so the
tests cover the start already.

## Constraints

- The work is done when the probes run, `oneOfStartHarnesses` lists the atc harness, and a start
  works in a real deployment.
- A start in a real deployment still meets your rules as `coding_start`, as
  [the policy of a coding task](../../architecture/core/coding-tasks.md#policy) says.

## Out of scope

- A built-in adapter that runs a session in an [imp](../../glossary.md). It gets its own adapter ID
  and its own design.
