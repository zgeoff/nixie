# 0024: Only the user undoes a definition change

- Date: 2026-11-22
- Status: decided

## Decision

nixie gives the agent no tool that reaches the undo of a task definition change. Only the user
undoes a change. [Task definitions](../architecture/core/definitions.md) covers what an undo
restores.

## Why

- An undo can put back an earlier version of a definition, with its schedule, brief and tools. A
  model that a page or a message has steered could use an undo to bring back a version the user
  replaced.
- Each change the agent makes already reaches the user as a notice, and the undo is the user's way
  to reverse one.

## Rejected alternatives

| Option                               | Why not                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------- |
| an undo tool for the agent           | A steered model could restore a version that the user replaced.            |
| an agent undo that the user approves | The user already holds the undo, so the approval adds a step and no reach. |
