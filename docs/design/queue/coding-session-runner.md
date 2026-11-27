# The coding session runner, the start that is not live yet

- **Status:** agreed
- **Work items:**
  [make the atc start live once the harness probes run](https://linear.app/zgeoff/issue/GEO-2868)

If you pick up the work item above, this is what is left of the coding session runner and what the
finished work keeps true.

The coding runner, its tools, the `coding-atc` adapter and the supervision of a session in the live
view are built. Read [Coding tasks](../../architecture/core/coding-tasks.md) for the runner and
[the atc adapter](../../architecture/connectors/coding-atc.md) for the adapter. Still open is the
`coding.start` call for an atc coding task in a real deployment. The work item has the outcome and
no steps, and no doc in the repo describes the harness probes or where `oneOfStartHarnesses` gets
filled. Find both in the code and record the steps in the work item.

## Start in a real deployment

`oneOfStartHarnesses` is the list of harnesses a start may use. It stays empty until the atc harness
probes run, so the start is unreachable in a real deployment. Tests cover the start through the
gateway double, which a test build reaches through `NIXIE_TEST_ATC_URL`.

## Constraints

- The work is done when the probes run, `oneOfStartHarnesses` lists the atc harness, and a start
  works in a real deployment.
- A start in a real deployment still goes through the user's policy rules, which decide whether an
  action runs, asks first or is refused. Declare `coding_start` for it. The coding module defines
  that effect, and the start, the join and the stop of a started session all declare it. Keep
  `coding_start` apart from `code_run`. `code_run` covers code in nixie's own sandbox, and a start
  acts on a coding session outside nixie that nixie does not see call by call. See
  [the policy of a coding task](../../architecture/core/coding-tasks.md#policy).

## Out of scope

- A built-in adapter that runs a session in an [imp](../../glossary.md). It gets its own adapter ID
  and its own design.
