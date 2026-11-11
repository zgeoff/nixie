# Design sessions to run

You hold 2 design sessions with the agent: one on the voice call, and one on a line that nixie types
into a coding session. A design session is a meeting of you and the agent that settles the open
questions of one design. It ends with a design that you sign off. A design session is never build
work, so a builder that works from this folder skips both. For each of the 2, this doc gives what it
decides, which inputs to bring and what comes out.

Five docs hold the detail. The voice session has [an agenda](voice-session.md),
[inputs](voice-session-inputs.md) and [questions](voice-session-questions.md). The typing session
has [an agenda](typing-session.md) and [inputs](typing-session-inputs.md).

An item marked `(open: <name>)` is not settled. [The open list](open/ports.md) describes each item
and links its tracker issue, and it links the tracker issue of each design session. Each design
session is one slice of work in [the slices](slices/ports.md).

## Terms

All 6 session docs use these terms, beside the [glossary](../../glossary.md).

Who acts:

- **You** are the person nixie works for.
- **The agent** is the coding agent that works on the repo with you. It reads docs, measures, writes
  the designs and files issues.
- **nixie** is the product. When a sentence is about what a call or a typed line does, nixie acts,
  and never the agent.

The sessions:

- **The voice session** and **the typing session** are the 2 design sessions.
- A **coding session** is a session of a coding agent that nixie steers, such as an atc session.
- A **build issue** is a tracker issue for build work. The agent files the build issues that a
  design calls for.
- A **contract** is an agreement between 2 parts of nixie that is costly to change, such as what one
  part passes to the other. Each agenda numbers its contracts.
- **Intended** marks the option that the design work behind these docs prefers. You decide every
  question, and you may pick another option.
- **H1 to H5** label the 5 voice questions about the turn behind a call. **T1 to T12** label the
  typing questions. Every other voice question has a short name in bold.
- **The tuning pass** is tracker work that tunes the voice settings after the voice call is built.

The voice call:

- **The speech provider** is OpenAI's speech service. **GPT-Live** is its speech-to-speech model.
  Under [decision 0040](../../decisions/0040-voice-pipeline.md), GPT-Live listens to you and speaks
  to you during a call.
- A **provider session** is one connection to the speech provider.
- The **speech layer** is the provider session and nixie's code that holds it.
- **nixie's conversation turn** is a turn of your conversation with nixie, in which Claude writes
  the reply.
- A **hand-off** is one request that the speech layer passes to nixie's conversation turn during a
  call. **The turn behind a call** is the conversation turn that answers a hand-off.
- **Barge-in** is you speaking over a reply. **Echo** is the device's microphone picking up the
  reply that its speaker plays.
- **The spikes** are 2 research packages. The first-token spike is in `research/sdk-first-token`.
  The voice-latency spike is in `research/voice-latency`, and its reply report compares
  speech-to-speech models.

The turn behind a call:

- A **step** is one unit of a task's work, which nixie claims and commits as a whole.
- The **conversation guest** is the program in a sandbox that runs the conversation's model loop.
- A **model harness** is the program that runs a model's loop, such as the Agent SDK. The **harness
  boundary** is the interface between nixie and a harness, and [model harnesses](model-harnesses.md)
  designs it. A **capability** is one thing that a harness declares it can do, such as `resume`.

The typed line:

- **atc** is a separate product that runs coding sessions under its own rules. It is the first
  product that nixie's coding adapter steers. atc has API procedures, and MCP tools that wrap some
  of them. A **listed principal** is a caller that atc lists as allowed.
- A **typed line** is text that nixie types into the terminal of a coding session. The coding
  session reads it as input from the person at the terminal.
- **The coding design** is [the coding doc](../platform/connectors/coding.md), the design of the
  coding adapter.
- **The approval forwarding design** is the design of durable approval forwarding for coding
  sessions. It has a tracker issue, which the open list links.

## Before either session

The agent does 2 things before a design session, and shows you what it found when that session
starts:

- Before the voice session, the agent reads the speech provider's docs for each fact that
  [the voice inputs](voice-session-inputs.md) list for it to verify. The repo lacks those facts
  (open: provider facts).
- Before the typing session, the agent reads atc's docs at atc's main branch, to learn which API
  procedures a listed principal may call (open: atc principal).

## The voice session

- **What it decides.** Every open detail of a voice call on GPT-Live: the turn behind a call, where
  the audio flows, the record of a call, approvals during a call, the voice and its settings, and
  what happens when you speak over a reply. [The voice call session](voice-session.md) gives the
  order of the decisions and the 5 contracts that the voice session settles.
- **Inputs to bring.**
  - Your decision on the design of the model harness boundary. The doc
    [model harnesses](model-harnesses.md) owns that design. Make the decision before the voice
    session, because question H1 depends on it (open: waiting designs).
  - Your answer on barge-in. The voice session covers barge-in and echo, with a reservation of
    yours. The content of the reservation is not on record, so you state what it excludes (open:
    barge-in reservation).
  - [The voice inputs](voice-session-inputs.md): what is settled, what is measured, what to verify,
    and where 2 docs disagree.
  - [The voice questions](voice-session-questions.md), each with its options.
- **During the session.** The agent does 2 checks before you sign off. The voice call session doc
  gives both.
- **What comes out.** A docs pull request that you approve, a voice design with no open question,
  and the build issues in the tracker. The tuning pass starts after the last voice build issue is
  done.

## The typing session

- **What you decide first.** Whether the typing session takes place at all. This is question T1, and
  you answer it without a session (open: typing session fate). The options are to close the typing
  issue, to hold the typing session, or to hold one design session for the typed line and the
  approval forwarding design together.
- **What it decides, if it takes place.** When a typed line counts as your approval, and which atc
  procedure and tool names the coding design uses. [The typing session](typing-session.md) gives the
  order of the decisions and the 2 contracts that the typing session settles.
- **Inputs to bring.**
  - [The typing inputs](typing-session-inputs.md): what is settled, what reads as settled and is
    not, the facts about atc, and where 2 docs disagree.
  - The questions T2 to T12, in the typing session doc.
- **What comes out, if you close the typing issue.** The agent closes the issue with a comment. The
  agent adds one question to the approval forwarding design: whose authority nixie uses when it
  decides a pending approval of a coding session.
- **What comes out, if the typing session takes place.** You sign off a rule for a typed line. The
  coding design states that rule and uses only names that atc has, and a decision record exists. The
  agent files a build issue only if nixie builds typing.

Other work never waits for the typing session. In the typing session, you and the agent design a
rule. nixie's connection to atc is not built, and the typing session does not design it.

## Not in scope

- The voice design and the rule for a typed line. You and the agent write each in its design
  session.
- The tuning pass.
- The atc runner. [The task runner port](task-runner-port.md) covers runners.
