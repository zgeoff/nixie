# 0055: The report shape of a task

- Date: 2026-11-12
- Status: decided

## Decision

A definition or a `task.start` call may declare the shape of the report that the task's model
returns. The model fills every field, and code fills none.

1. **A small subset of JSON Schema.** The key `reportShape` holds `properties` and `required`. A
   field takes keywords from a closed table: `type`, `description`, `enum`, `items`, `properties`,
   `required`, `maxLength`, `maxItems`, `minimum` and `maximum`.
2. **One check, at the seed and the start.** nixie refuses a shape that holds a keyword outside the
   table, and starts nothing, so nixie never accepts a rule that it does not enforce.
3. **The model reports through one tool.** `task.report` takes `summary`, which stays required, and
   `fields`. nixie checks the fields against the task run's shape.
4. **A mismatch is a tool error.** The error names each missing field. It writes no report and
   counts toward no limit, so the model can correct the call.
5. **The shape is pinned on the task run.** A later change to the definition leaves the shape of an
   open task run as it was.

## Why

- A task that reads pages or sorts mail gives a result with parts. A caller that reads those parts
  by name needs them in a known shape, and prose alone gives none.
- The model already holds what the fields need, so queries that code runs would add a second system
  for the same result.
- A closed table lets code decide at the start whether nixie can enforce a shape. A new keyword is a
  new row, and no stored record changes.

## Rejected alternatives

| Option                                         | Why not                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| a flat map of 4 type names                     | it cannot hold a list of allowed values, a length limit or a nested field, and a fifth type name fails the decode on the release before |
| any JSON Schema                                | the validator accepts a keyword it does not know and never enforces it                                                                  |
| fields that code fills from registered queries | it needs a registry of queries, and each new field needs a code change                                                                  |

## Consequences

- A definition that needs a keyword outside the table waits for a row in the table.
- A task with no shape reports a summary only.
- `task.define` takes no shape in this pass, so a shape comes from a definition file or a
  `task.start` call.
