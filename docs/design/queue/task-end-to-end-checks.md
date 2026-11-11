# End-to-end checks for a task, its worker and its messages

This doc covers 3 checks that exercise a task, its worker, its report and its task messages
together: one recorded turn on a preview, and 2 automated tests. The checks add no behaviour to
nixie. Each part has tests of its own, and these 3 checks show what those tests cannot: that the
parts work in one turn, and that text from a web page that a worker read never counts as a message
from you.

Slice 10 in [the worker slices](slices/tasks-worker.md) is the work that adds the 3 checks. A slice
is one unit of the build. Terms that this doc does not define are in the
[glossary](../../glossary.md), which defines conversation, task, worker, imp, proposal, moment and
untrusted.

## Terms

- A **started task** is a task that a `task.start` call made.
- A **task message** is a message from one task to another.
- `worker.run` is the tool by which a task runs a worker: [task workers](task-workers.md).
- `task.report` is the tool by which a task ends its work with a report:
  [the report shape](task-report-shape.md).
- A **preview** is the throwaway test build of one pull request. It runs real imps and a real model.
- A **recorded turn** is one turn that a person or a coding agent runs on a preview. That person or
  coding agent then reads the records of the turn from the preview and pastes them in the pull
  request.
- A **poisoned page** is a test web page whose text tries to give instructions to the model that
  reads it.
- The **source** of a memory write is the field that records where the text of the write came from.
  The value for text from a web page is outside content.

## Built

This section describes the code as it is before the 3 checks exist.

- The poisoned-page integration test serves a poisoned page to the conversation and to the built-in
  note-taking task. It asserts what each of them writes to memory.
- A started task can have the memory write tools: [memory tools on tasks](memory-task-tools.md).
- A moment covers a range of records in one thread. The tests of moments use the conversation's
  thread.

## The recorded turn

The recorded turn shows that the parts work together with a real model and real imps.

- A person or a coding agent runs the recorded turn on a preview. The preview API check runbook in
  `docs/runbooks/` gives the steps.
- In the turn, that person or coding agent sends the conversation one message that asks it to start
  a task.
- The records of the turn show 3 things: the task called `worker.run` and the worker fetched a web
  page through the fetch tool; the task called `task.report`; and the report arrived on the
  conversation's thread.
- The recorded turn never writes to production.

## The poisoned-page test with a worker

This test shows that text from a poisoned page never counts as a message from you.

- In the test, a started task has the tool `memory.remember`. The task calls `worker.run` with the
  address of a poisoned page, and the worker fetches the page through the fetch tool.
- A worker has no memory tool, so the worker writes nothing to memory. Each memory write in the test
  comes from the started task.
- Every memory write that the poisoned page causes is a proposal, and its source is outside content.
- The worker calls only the tools that the started task gave in the `worker.run` call.
- nixie never treats the body of a task message as a message from you.

## The moment test over a task thread

This test shows that a moment works on the thread of a task.

- The test saves a moment over a range of records on the thread of a task. It reads the moment back
  through the tool `moment.read`.
- `moment.read` returns every record of the range: tool calls, tool results, worker records and task
  messages. Each record has its source.

## Not in scope

- A recorded turn on production.
- A check that starts a whole nixie inside a test imp.
