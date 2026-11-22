# 0024: Only the user undoes a definition change

- Date: 2026-11-22
- Status: decided

## Decision

The agent can change a [task definition](../architecture/core/definitions.md): its schedule, its
instructions or its tools. An undo of a change puts the previous version of the definition back in
force. nixie never gives the agent a tool that undoes a change. Only the user can undo one.

## Why

- When the user asks for a change in chat, the agent's change goes in force with no prompt. nixie
  shows the user a notice of each change with an undo control, and that undo is the user's way back
  from a change the agent got wrong. An agent that could undo would hold that way back itself.
- The agent reads web pages and messages that may hold instructions planted to mislead it. An agent
  misled that way could undo a change and bring back a version of a definition that the user had
  replaced, such as one with a tool the user took away.

## Rejected alternatives

| Option                              | Why not                                                               |
| ----------------------------------- | --------------------------------------------------------------------- |
| an undo tool for the agent          | A misled agent could restore a version the user replaced.             |
| an undo tool that the user approves | The user can already undo directly, so the approval only adds a step. |
