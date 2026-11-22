# 0024: Only the user undoes a definition change

- Date: 2026-11-22
- Status: decided

## Decision

The agent can change a [task definition](../architecture/core/definitions.md), such as its schedule,
its instructions or its tools, and each change can be undone, which puts the version before it back
in force. nixie never gives the agent a tool that undoes a change. Only the user can undo one.

## Why

- The agent reads web pages and messages that may hold instructions planted to mislead it. An agent
  misled that way could undo a change and bring back a version of a definition that the user had
  replaced, such as one with a tool the user took away.

## Rejected alternatives

| Option                               | Why not                                                               |
| ------------------------------------ | --------------------------------------------------------------------- |
| an undo tool for the agent           | A misled agent could restore a version the user replaced.             |
| an agent undo that the user approves | The user can already undo directly, so the approval only adds a step. |
