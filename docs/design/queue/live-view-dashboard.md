# Dashboard states, fires and filters

- **Status:** built
- **Work items:** [dashboard states, fires and filters](https://linear.app/zgeoff/issue/GEO-2650)

The dashboard groups each task by its listed state, shows on a definition's task when its task run
was scheduled and whether it fired late, and filters by definition and by state. It is built.
[The task dashboard](../../architecture/channels/client.md#the-task-dashboard) and
[reading tasks](../../architecture/channels/api.md#reading-tasks) describe it, and this page keeps
the decisions that shaped it and what it leaves out.

## Decisions

- **The dashboard keeps its 3 groups, Conversation, Working and Held, and Working holds every task
  that is not held, done or closed.** The owner's call on 14 Nov 2026: the dashboard keeps 3 groups,
  and every task the dashboard shows today stays on it.
- **`listedState` is a field of its own, and `state` gains no value.** An agent's call on 13 Nov
  2026: today's client maps every `state` value to a label, and a client of the release before would
  show no label for a new value.
- **The server filters, never the client.** An agent's call on 13 Nov 2026: the list stops at 100
  tasks, so a filter in the client would miss a match and give no sign of it.
- **A carrying task run shows the fire of the task run it carries on from.** An agent's call on 13
  Nov 2026: a raise or a restart goes on with the same scheduled work, so its row keeps that work's
  scheduled time.
- **The dashboard reads the list on a 60-second timer as well as on the stream.** An agent's call on
  13 Nov 2026: the stream never carries a pause or a resume of nixie.
- **nixie's pause sets the listed state, and a poll fire shows no fire.** Agent calls on 17 Nov
  2026: a task that the pause holds lists as `paused` so it sits in Held and matches that filter,
  and a poll has no schedule to be late against.
- **Each dashboard filter takes one value.** An agent's call on 17 Nov 2026: the API still takes 1
  to 11 states.

## Out of scope

- Supervised coding sessions as a group, which [GEO-311](https://linear.app/zgeoff/issue/GEO-311)
  covers.
- A "needs you" group. The dashboard gains it once the approval cards land.
- Proposals that wait for your answer. The approval cards and the approval digest of
  [the approval record](https://linear.app/zgeoff/issue/GEO-1804) show them.
- The routes `/tasks/ended` and `/definitions`, which
  [the views of definitions and ended task runs](definition-views.md) cover.
