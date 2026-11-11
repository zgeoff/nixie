# 0050: No built-in memory tasks

- Date: 2026-11-11
- Status: decided
- Design: [the removal of the built-in memory tasks](../design/queue/memory-task-delete.md)

nixie has no built-in task that writes memory. The built-in note-taker, which saved memories from
the conversation in batches, and the built-in consolidator, which merged and rewrote items in bulk,
are deleted. Nothing built in takes their place.

These choices settle the delete:

1. **One deploy.** The deployment's config drops both tasks' sections, and the deployment takes the
   delete release, together. The release keeps no stub section and has no start check.
2. **Tasks do the work.** A task that the agent starts may do the consolidator's job with the
   ordinary memory tools, under [0051](0051-memory-tools-on-tasks.md). The docs hold 3 example task
   definitions on a schedule trigger, each with one test: note-taking, consolidation and moment
   reflection.
3. **Ordinary tools only.** Moment reflection uses the ordinary moment tools, with no
   reflection-only tool and no named query. The `log` trigger source is not built, so the
   note-taking example runs on a schedule.
4. **Memory triage and its web view are canceled.** A task with the memory tools can do the job, so
   the special set-aside and reword tools are not built.
5. **The agent reads nothing that names the note-taker.** The session prompt drops its sentence.
   Each renderer of a stored origin uses no origin words or neutral ones, and never words that say
   the agent noted the item. Stored records do not change. The agent edits or retires an item whose
   own text names the note-taker itself.

## Why

- A task with the memory tools writes through the same write gate, so a built-in task is a second
  way to do the same job, with its own config, model role, prompt and tools to keep.
- A stored origin stays true to what wrote the item, and an earlier release still reads it. Words
  that say the agent noted the item would be false.

## Alternatives

- **Two deploys, with both tasks turned off by config first.** The rollback is safer, and the delete
  is slower.
- **Each job on a task template.** nixie would still ship each job, with the special tools, queries
  and report fields that each template needs.

## Consequences

- A rollback to a release that holds the tasks first sets `enabled: false` for both. Without that
  step both tasks start again and write memory.
- No bulk rewrite arrives as one diff. Each rewrite by a task is a write of its own under
  [0011](0011-memory-writes.md).
- The model roles for the 2 tasks go, which [0033](0033-model-profiles.md) records.
