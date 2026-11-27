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
states the outcome and gives no steps. No doc in the repo describes the harness probes or where
`oneOfStartHarnesses` gets filled. The contributor who picks it up finds both in the code and
records the steps in the work item.

## Start in a real deployment

`oneOfStartHarnesses` is the list of harnesses a start may use. It stays empty until the atc harness
probes run, so the start is unreachable in a real deployment. Tests cover the start, because a test
build reaches the gateway double through `NIXIE_TEST_ATC_URL`.

## Constraints

- The work is done when the probes run, `oneOfStartHarnesses` lists the atc harness, and a start
  works in a real deployment.
- A start in a real deployment still meets the user's policy rules, which decide whether an action
  runs, asks first or is refused. It declares `coding_start`. The coding module already defines that
  effect, and the start, the join and the stop of a started session all declare it. It is separate
  from `code_run`, which covers only code in nixie's own sandbox, because a start acts on a coding
  session outside nixie that nixie does not see call by call. See
  [the policy of a coding task](../../architecture/core/coding-tasks.md#policy).

## Out of scope

- A built-in adapter that runs a session in an [imp](../../glossary.md). It gets its own adapter ID
  and its own design.
