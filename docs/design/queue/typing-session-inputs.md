# The typing session: inputs

Bring these facts to the typing session, the design session whose agenda is
[the typing session](typing-session.md). This doc lists what the decisions settle, what a doc states
as settled although it is open, the facts about atc, and each place where 2 sources disagree.

[Design sessions to run](design-sessions-to-run.md#terms) defines the terms and the labels that this
doc uses, such as atc, a typed line, a coding session, the agent and question T1. An item marked
`(open: <name>)` is in [the open list](open/ports.md), which also links the typing issue.

## What the decisions settle

- nixie steers coding agents through one interface, `CodingAdapter`. atc is its first provider, and
  a built-in adapter is the second
  ([decision 0022](../../decisions/0022-coding-and-code-execution.md)).
- A coding session is a task, and your rules decide every start of one and every message to one
  (0022, the [coding design](../platform/connectors/coding.md)).
- A chat message never counts as an approval. The model would interpret the message, and injected
  content could fake one ([decision 0002](../../decisions/0002-approvals.md)).
- nixie gives a tool that starts or messages another agent the same handling as any other tool
  ([decision 0017](../../decisions/0017-mcp-proxy.md)).
- The output of a coding session is untrusted content, so nixie treats text from a coding session as
  untrusted in every action that uses it.
- The rule on when a typed line carries your authority belongs to nixie's policy, and never to an
  adapter.

The design work on the queue settles 2 more facts, which the repo's docs do not hold:

- The atc runner is the task runner that provides `CodingAdapter` for atc. It calls atc's API
  procedures over an authenticated transport, as a principal that atc lists. It does not use the MCP
  proxy, which serves tools to the model only. The atc runner has no design.
- Nothing relays your approval of a pull request from one session into another. Your approval of a
  pull request goes on record through a command and a check, and the open list links the design
  record that gives both.

Your own statement is on the typing issue: you would authorise nixie to type into a coding session.
In the statement, you give no rule, no use for typing and no way to reach atc, so whether nixie
builds typing is open. Questions T1 to T3 decide it.

## What reads as settled, and is open

Each bullet gives a statement that a doc or the typing issue makes, and then why it is open.

- The typing issue takes it as given that nixie types into a coding session under a rule. You have
  set no such rule, and T1, T2 and T3 each have an option without typing.
- The typing issue proposes a starting rule: nixie types only your answer, in your words, under your
  approval, for that one action. You have not confirmed the rule.
- The coding design maps its adapter calls `message` and `stop` to the MCP tools
  `atc_session_message` and `atc_session_kill`. The atc runner calls atc's API procedures
  `session.message` and `session.kill` for those 2 calls. Which atc names the coding design gives
  for its adapter calls is part of the typing session's outcome.
- Decision 0022 and the coding design have nixie reach atc through the MCP proxy. The atc runner
  does not use the proxy.
- The approval forwarding design may read as if nixie never answers a coding session's permission
  prompt with a typed line. That design lists the point as a question, and you have not answered it.

## Facts about atc

This list is from the design work. The agent checks each fact against atc's docs, at atc's main
branch, before the typing session.

- atc's API has a procedure that types a line into a session, `session.submit`, and one that answers
  a menu, `session.choose`. The MCP tools `atc_terminal_type` and `atc_terminal_choose` call them.
- A listed principal can call 5 procedures for certain: spawn, message, kill, the read of events and
  the read of a message. Whether it can call `session.submit` or `session.choose` is not verified
  (open: atc principal).
- atc has the MCP tools `atc_message_send`, `atc_terminal_type`, `atc_terminal_choose` and
  `atc_session_stop`. It has no tool that reads a report.
- Typing and menu answers take atc's `spawn` scope, the same scope as starting a session.
- atc stores an idempotency key for a spawn and for a message. It stores none for typing.
- atc labels a message with its sender, and it labels a remote caller as a `connector`. A typed line
  carries no label.
- atc's read of a session returns the question that the session waits on.

Two facts about nixie's built code bear on the questions:

- nixie's rule matcher has the `task.start/atc` variant. T4 asks what a rule matches for typing.
- nixie's client records which spans of a message you typed yourself. T7 asks whether a typed line
  must equal such a span.

## Sources that disagree

Between the docs and the design work:

- Decision 0022 and the coding design reach atc through the MCP proxy. The atc runner calls atc's
  API procedures, and the repo's docs do not say so. The rewrite of the coding design's section on
  the atc adapter is part of the build of the atc runner.
- The coding design lists 3 tools that atc lacks: `atc_session_message`, `atc_report_get` and
  `atc_session_kill`. The coding design has no typing tool.
- The coding design gives every adapter action an idempotency key. atc stores none for typing.
- Under the coding design, the model sees only the adapter's tools. Under the MCP proxy design, each
  tool of a proxied server is a nixie tool under the server's prefix. If atc were a proxied server,
  the model would see atc's tools too.

Between the typing issue and the docs:

- The issue's Outcome section and the second line of its Context section describe one use of typing:
  nixie relays your answers into another coding session. Nothing does that relay, and the issue
  gives no other use.
- The issue's first question and its first acceptance line use the names of MCP tools. The atc
  runner needs the names of atc's API procedures.
- The issue omits `atc_terminal_choose`, which atc scopes the same as typing.
