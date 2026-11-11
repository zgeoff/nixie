# The typing session

This doc is the agenda of the typing session: the design session on a line that nixie types into a
coding session with your authority. Before any session, you decide whether the typing session takes
place at all (T1). If it does, you and the agent settle when a typed line counts as your approval,
and the agent corrects the atc names in the coding design. Other work never waits for the typing
session.

[Design sessions to run](design-sessions-to-run.md#terms) defines the terms and the labels that this
doc uses, such as atc, a typed line, a contract and "intended". The facts to bring are in
[the typing inputs](typing-session-inputs.md). The coding design is
[the coding doc](../platform/connectors/coding.md). An item marked `(open: <name>)` is in
[the open list](open/ports.md), which also links the typing issue and the issue of the design of
durable approval forwarding. This doc calls that design "the approval forwarding design".

## The order of the decisions

1. Answer T1, without a session (open: typing session fate). Every other question depends on it.
2. If the typing session takes place, answer T2, then T3.
3. After T3, answer the rest in this order: T4, T6, T7, T8, T9, T10, T11, T12.
4. Two questions belong to other designs: T5, and the question on a permission menu at the end of
   the list. You answer neither in the typing session.

## T1: whether the typing session takes place

The typing issue has 2 requests: a policy rule for a typed line, and the right atc names in the
coding design. T1 has 3 options:

- Option 1: close the typing issue, and move its policy question to the approval forwarding design.
- Option 2: leave the typing issue open, and hold the typing session after the approval forwarding
  design is done.
- Option 3: hold one design session for both the typed line and approval forwarding.

Intended: option 1. The reasons:

- The typing issue has one use of typing, a relay of your answers into another coding session, and
  that relay does not exist.
- The fix of the atc names belongs to the pull request that builds the atc runner.
- The approval forwarding design covers a structured way for nixie to approve or reject a pending
  approval of another coding session. That design links the typing issue for one question: whose
  authority nixie uses when it decides.

What option 1 drops:

- The typing issue is the only open issue that asks when a typed line carries your authority. The
  approval forwarding design covers a pending approval only. After a close, the tracker has no place
  for a typed answer to a coding session's plain question, where no approval is pending.
- The starting rule that the typing issue proposes: nixie types only your answer, in your words,
  under your approval, for that one action. Only the closed issue holds the text.
- An early fix of the coding design. Its 3 wrong tool names, `atc_session_message`, `atc_report_get`
  and `atc_session_kill`, wait for the pull request that builds the atc runner.

What option 1 preserves: the closed issue holds your statement that you would authorise typing, and
this doc holds the questions.

## Questions

You answer each question but the 2 that belong to other designs. T2 to T12 apply only if the typing
session takes place.

The use and the way to atc:

- **T2. Which use does typing have?**
  - Options: nixie answers a coding session's question in your words; nixie answers a coding
    session's permission menu; no use until a gap map asks for one.
  - The typing issue's one use is the relay that does not exist. A structured way for nixie to
    decide an approval is not typing.
  - Depends on: T1.
- **T3. How does a typed line reach atc?** The atc runner does not use the MCP proxy.
  - Option 1: the atc runner calls atc's `session.submit` as a listed principal. If atc does not
    allow a principal to call it, atc needs a change, with an issue in the atc repo.
  - Option 2: beside the atc runner, nixie adds atc as a server of the MCP proxy, for
    `atc_terminal_type` and `atc_terminal_choose` only.
  - Option 3: nixie does not type until atc has a structured answer to a question.
  - Intended: none. Options 1 and 2 must meet the requirements of contract 7.
  - Depends on: T2.
- **T4. What is the model's tool called, and what does a rule match?**
  - Options: a nixie tool on the atc runner, as `task.message` is; the proxied atc tool under the
    `atc` prefix.
  - Depends on: T3.
- **T5. What does the `results` call of `CodingAdapter` read?** The `results` call returns a
  report's full text, and atc has no counterpart for it.
  - Options: atc's `message.get`; the whole answers that atc's read of events returns; atc's read of
    the transcript.
  - T5 belongs to the design of the atc runner.

The authority rule:

- **T6. What makes a typed line carry your authority?**
  - Option 1: a proposal per line. Its card shows the exact text and the coding session, and you
    approve it by a checked action.
  - Option 2: an allow rule that you set in advance, for a coding session or for a kind of answer.
  - Option 3: your chat message alone. [Decision 0002](../../decisions/0002-approvals.md) forbids
    it, so option 3 needs a change to that decision.
  - Under [decision 0048](../../decisions/0048-one-approval-system.md), each approval binds to the
    hash of one exact operation.
  - Intended: option 1. It follows 0002, and it matches the starting rule.
  - Depends on: T2.
- **T7. In the starting rule, what does "in your words" mean?**
  - Options: the typed text equals a span that you typed; nixie may rephrase, and the card shows the
    result.
  - Depends on: T6.
- **T8. In the starting rule, what does "for that one action" bind an approval to?**
  - Options: the coding session and the question that it waits on; the coding session alone; a time
    window.
  - A coding session can move on between your approval and the typing.
  - Depends on: T6.
- **T9. Which effect does the typing tool declare, and is typing in the always-ask set?**
  - Options for the effect: an effect of its own; `send` to a destination; the same effect as
    starting a coding session.
  - Intended for the always-ask set: typing counts as widening what a coding session may do, so
    nixie asks you on every typed line. Under
    [decision 0005](../../decisions/0005-effects-and-taint.md), a bounded rule of yours can lift
    that.
  - Depends on: T3.
- **T10. May nixie type after the typing task read untrusted content?**
  - Options: nixie always asks you; nixie never types then; your rules decide, as for any tool.
  - The limits on destinations cover nixie's sending tools, and typing is not one of them.
  - Intended: nixie always asks you, and the card shows where the text came from.
  - Depends on: T9.
- **T11. How does anyone tell nixie's typed line from your own typing?**
  - Options: nobody can; nixie records every typed line; atc labels the line.
  - atc puts no label on a typed line, so the coding session treats the line as yours. T11 is about
    identity: whether anyone can tell nixie's words from yours.
  - Intended: nixie records every typed line. A label in atc is a change to atc, with an issue in
    the atc repo.
  - Depends on: T3.
- **T12. Does the atc runner also answer a menu, and read the screen before it types?**
  - Options: add `atc_terminal_choose` and `atc_terminal_read`; omit both.
  - A typed line lands on whatever the coding session shows at that moment.
  - Depends on: T3.
- **May a typed line answer a coding session's permission menu?** The approval forwarding design
  holds this question, and it is not decided.

## The 2 contracts

Each contract is costly to change and has more than one good design. The typing session picks the
design. The bullets under each contract are requirements that every design of it meets. The numbers
carry on from the 5 contracts of [the voice call session](voice-session.md).

6. **A typed line that carries your authority.** nixie types into a coding session that treats
   terminal input as coming from the person at the terminal.
   - Every typed line traces to one answer that you gave, for one question, of one coding session.
     The record shows all 3.
   - Text from untrusted content never reaches a terminal before you see that exact text.
   - nixie types a line at most once. When nixie cannot tell whether it typed, nixie tells you, and
     it does not type again.
7. **Terminal input on the atc runner.** `CodingAdapter` has 6 calls, and typing is not one of them.
   A built-in adapter has no terminal that a person types into.
   - The model reaches typing only through a nixie tool with a declared effect.
   - On a runner without a terminal that a person types into, nixie rejects the call with a named
     error.
   - The output of a coding session reaches the task as untrusted content, through a call that every
     runner has.

## What the design of a typed line needs from other designs

- **The task runner port, and the task brief and message envelope.** The design needs an answer on
  whether a typed line is a kind of message that the atc runner delivers, and on how nixie records
  it. [The task runner port](task-runner-port.md) has a start and a message, and it has no call for
  terminal input.
- **The trigger source.** The design needs a source with a cursor for a coding session's events. See
  [schedules and triggers](schedules-and-triggers.md).
- **The atc runner.** A build of typing needs the atc runner first.

## What comes out

If you pick option 1 of T1:

- The agent closes the typing issue with a comment. The comment gives where the policy question and
  the fix of the atc names went.
- The agent adds the policy question to the approval forwarding design: whose authority nixie uses
  when it decides a pending approval.

If the typing session takes place, under option 2 or option 3 of T1, it ends with a docs pull
request and a decision record:

- The coding design uses only names that atc has. On the pull request's branch, this command prints
  nothing. On the main branch before the pull request, it prints 3 lines of the coding design.

  ```sh
  git grep -n -e atc_session_message -e atc_session_kill -e atc_report_get -- \
    docs/design/platform docs/architecture docs/decisions
  ```

- The coding design states the rule for a typed line. On the pull request's branch,
  `git grep -n -i "typed line" -- docs/design/platform/connectors/coding.md` prints that rule. On
  the main branch before the pull request, it prints nothing.
- Each atc name in the coding design appears in atc's docs at atc's main branch. The agent reads the
  atc repo, and lists each name with its place in atc's docs in the pull request description.
- A decision record of the typing session exists as a document in the tracker.
- `bun run check:docs` passes on the pull request.
- If nixie builds typing, the agent files a build issue for one tool that types into a coding
  session. The release before that build has no such tool, and the tool has no name yet.

## Not in scope

- The build of nixie's connection to atc. The typing session designs a rule and builds nothing.
- The design of the atc runner. [The task runner port](task-runner-port.md) covers runners.
- The approval forwarding design.
