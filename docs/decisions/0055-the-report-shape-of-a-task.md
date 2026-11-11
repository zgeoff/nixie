# 0055: The report shape of a task

- Date: 2026-11-12
- Status: decided
- Design: [the report shape](../design/queue/task-report-shape.md)

A definition or a `task.start` call may declare the shape of the report that the task's model
returns. The model fills the fields. nixie fills none of them from code.

These choices settle the shape:

1. **A small subset of JSON Schema.** The key `reportShape` holds `properties` and `required`. A
   field takes one of 10 keywords from a closed table: `type`, `description`, `enum`, `items`,
   `properties`, `required`, `maxLength`, `maxItems`, `minimum` and `maximum`.
2. **One check, at the seed and the start.** nixie refuses a shape that holds a keyword outside the
   table, and starts nothing. So nixie never accepts a rule that it then does not enforce.
3. **The model reports through one tool.** `task.report` takes `summary`, which stays required, and
   `fields`. nixie checks the fields against the shape of the task run.
4. **A mismatch is a tool error.** The error names each missing field. It writes no report and
   counts toward no limit, so the model can correct the call.
5. **The shape is pinned on the task run.** A later change to the definition does not change the
   shape of a task run that is open.

This replaces the earlier design of the report, in which code filled named fields from registered
queries.

## Why

- A task that reads pages or sorts mail gives a result with parts. A caller that reads those parts
  by name needs them in a known shape, and prose alone gives none.
- The model already holds what the fields need, so a registry of queries that code runs adds a
  second system for the same result.
- A closed table lets code decide, at the start, whether nixie can enforce a shape. A new keyword is
  a new row, and no stored record changes.

## Alternatives

- **A flat map of 4 type names.** It is the smallest build. A shape then cannot hold a list of
  allowed values, a length limit or a nested field, and a fifth type name fails the decode of a
  stored record on the release before.
- **Any JSON Schema.** The validator accepts a keyword that it does not know and never enforces it.
- **Fields that code fills from registered queries.** This was the earlier design. It needs a
  registry, and each new field needs a code change.

## Consequences

- A definition that needs a keyword outside the table waits for a row in the table.
- A task with no shape reports a summary only, as today.
- `task.define` does not take a shape in this pass, so a shape comes from a definition file or from
  a `task.start` call.
