# The pause, and the restore that starts paused

- **Status:** partly built: everything but the trigger check, which [the task gate](task-gate.md)
  designs
- **Work item:**
  [hold a schedule fire while nixie is paused](https://linear.app/zgeoff/issue/GEO-2760)

The pause, the restore that starts paused and the resume are built, as
[pausing nixie](../../architecture/core/pause.md) describes. One part remains: while nixie is
paused, no schedule fires into a paused task. Today the trigger core reads no pause, so a schedule
fires into a task's inbox while nixie is paused.

## Triggers while paused

- While nixie is paused, `deliverTriggerBatch` writes nothing, takes no key and counts in no
  `delivered` a schedule event whose task is paused: the definition's task, or the conversation for
  `target: conversation`. It reads the pause before rows 4 to 6 of its table. The definition's
  watermark stays where it was.
- The source delivers the same events at its next tick. So the first tick after the resume, or after
  you resume that task, finds each missed fire late, and the catch-up rule of
  [triggers](../../architecture/core/triggers.md#the-schedule-source) decides: one catch-up within
  half the interval, and a `too_late` skip beyond it. A pause longer than half a schedule's interval
  skips that fire, as any downtime does.
- An exempt task takes its fires as on any day.
- A poll event delivers while nixie is paused, as
  [mail and calendar polls](mail-and-calendar-polls.md#one-deliver-call-of-a-poll-batch) says. Its
  fire and its met wait stay in the inbox until the task can take a step.
