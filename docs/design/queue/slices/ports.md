# Port rules and design sessions: the slices

Hold the 2 design sessions below. Each is one slice: a piece of work with an outcome and a check. A
design session ships no code, so neither slice is part of a deploy milestone.
[Port rules](../port-rules.md) has no slice. [The open list](../open/ports.md) has, in its section
"Not written", the work that the port rules call for and that no slice of any other part of this
folder covers.

[The terms](../design-sessions-to-run.md#terms) define the words and labels used here: the agent,
the voice session, the typing session, atc, a typed line, the harness boundary, barge-in, the tuning
pass, the coding design, the approval forwarding design, H1 and T1. "The voice agenda" is
[the voice call session](../voice-session.md), and "the typing agenda" is
[the typing session](../typing-session.md). An open item is an entry of the open list, named here in
bold.

Each slice has 5 fields:

- **Outcome:** what exists when the slice is done.
- **Follows:** the docs that you and the agent work through, and the open items that the agent
  settles as part of the slice.
- **Needs:** what must be true before the slice starts.
- **Check:** the evidence that the slice is done.
- **Milestone:** the deploy milestone, or "no deploy".

Each slice has the ID `ports-<n>`, which is unique across the queue, and each "Needs" names a slice
by its ID. In any other field of this file, "slice n" means `ports-n`.
[The work list](../work-list.md) gives the build order.

### ports-1. The voice session

- **Outcome:** You have signed off a voice design that answers every question of
  [the voice questions](../voice-session-questions.md). The agent has filed the voice build issues
  in the tracker. This slice's own tracker issue is
  [the voice call issue](https://linear.app/zgeoff/issue/GEO-1867).
- **Follows:**
  - The voice agenda, with [the voice inputs](../voice-session-inputs.md) and the voice questions.
  - Before the voice session starts, the agent settles **provider facts**.
  - During the voice session, before you sign off, the agent settles **resumed turn wait** and
    **unknown role key**. The first needs a model credential and your pick of the model for calls.
- **Needs:** nothing from a slice.
  - You have decided the design of the harness boundary. It is the first row of the table in
    **waiting designs**, and [model harnesses](../model-harnesses.md) owns the design. The build of
    that design is harnesses-3, and this slice does not wait for the build.
  - You have stated the content of **barge-in reservation**: which part of barge-in the voice
    session does not cover.
- **Check:**
  - The agent opens one docs pull request with the voice design. `bun run check:docs` passes on it,
    and you approve it.
  - On that pull request's branch,
    `git grep -n "^## Open questions" -- docs/design/platform/channels/voice.md` prints nothing. The
    command prints one line on a branch without the voice design's changes.
  - The pull request description gives, for each question of the voice questions, the line that
    answers it: a line of [the voice design](../../platform/channels/voice.md) or of
    [decision 0040](../../../decisions/0040-voice-pipeline.md). You read the list.
  - The blocked-by list of [the tuning pass issue](https://linear.app/zgeoff/issue/GEO-1868) has the
    voice build issue that comes last in build order.
- **Milestone:** no deploy.

### ports-2. The typing session, or the close of the typing issue

Your answer to T1 picks one of 2 branches. Option 1 of T1 is the close branch. Options 2 and 3 of T1
are the session branch. This slice's own tracker issue is
[the typing issue](https://linear.app/zgeoff/issue/GEO-945), and the approval forwarding design is
[this issue](https://linear.app/zgeoff/issue/GEO-70).

- **Outcome:**
  - Close branch: the agent has closed the typing issue with a comment, and has added the policy
    question of the typing issue to the approval forwarding issue. The policy question is whose
    authority nixie uses when it decides a pending approval of a coding session.
  - Session branch: you have signed off a rule for a typed line. The coding design states the rule,
    and every atc procedure name and tool name in the coding design is one that atc has. A decision
    record of the typing session exists in the tracker.
- **Follows:**
  - The typing agenda, with [the typing inputs](../typing-session-inputs.md).
  - Session branch: before the typing session starts, the agent settles **atc principal**.
- **Needs:** nothing from a slice.
  - You have answered T1, which is **typing session fate**.
  - Under option 2 of T1, you have signed off the approval forwarding design. That design is in no
    slice of this folder.
  - Under option 3 of T1, one design session produces the rule for a typed line and the approval
    forwarding design, and this slice's check covers the typed line only.
  - This slice does not need ports-1.
- **Check:** one list applies, by the branch. Before you answer T1, the slice has no check.
  - Close branch:
    - The typing issue has the state "closed".
    - The closing comment gives where the policy question went, and that the fix of the atc names in
      the coding design is part of the atc runner's build.
    - The approval forwarding issue has the policy question.
  - Session branch:
    - The agent opens one docs pull request with the changes to the coding design.
      `bun run check:docs` passes on it.
    - On that pull request's branch, this command prints nothing. It prints 3 lines of the coding
      design on a branch without those changes.

      ```sh
      git grep -n -e atc_session_message -e atc_session_kill -e atc_report_get -- \
        docs/design/platform docs/architecture docs/decisions
      ```

    - On that pull request's branch,
      `git grep -n -i "typed line" -- docs/design/platform/connectors/coding.md` prints the rule. It
      prints nothing on a branch without those changes.
    - The pull request description lists each atc name that the coding design uses, with the place
      of that name in atc's docs at atc's main branch.
    - The decision record of the typing session exists as a document in the tracker.
- **Milestone:** no deploy.
