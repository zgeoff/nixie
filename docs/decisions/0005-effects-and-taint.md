# 0005: The conversation is always untrusted and carries no taint flag

- Date: 2026-10-07
- Updated: 2026-10-15
- Status: decided

## Decision

The conversation is always untrusted, and nixie keeps no taint flag on it. Taint applies to jobs and
workers, the parts of nixie that can stay clean, and the first build treats every job run as
untrusted too.

The destination limits therefore apply to every send that starts from the conversation, and from
every job run. nixie asks before it sends or acts towards a destination with no standing permission.
It stays free to reply to you, to the sender it read, and to people you mark as known, and to write
drafts and notes inside nixie.

## Why

- A conversation reads outside content within minutes, and no system examined clears taint once that
  content is in a model's context
  ([taint in practice](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.3-notes/taint-in-practice.md)).
  A flag on the conversation would be on nearly all the time, and would add code that decides
  nothing.
- A clean planner never reads outside content, and a planner that cannot read the page is not a
  useful assistant.
- Jobs are where clean runs are possible and where taint pays off, by sparing a job that reads only
  your data from destination prompts.
- A worker holds only what its job needs, so injected instructions inside a worker have little to
  leak.

## Rejected alternatives

| Option                                                                                          | Why not                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| no taint layer                                                                                  | Rules and approvals alone decide each action. An injected instruction is stopped only when a rule happens to ask, which breaks the principle that untrusted content cannot reach a new destination alone.       |
| a taint flag on the conversation, set when it reads free text and kept for the rest of its task | It is nearly always on, and nothing clears it.                                                                                                                                                                  |
| clear taint at your next message                                                                | The outside content is still in the model's context after you speak, so the reset is not sound.                                                                                                                 |
| taint per task                                                                                  | It puts the boundary inside a task instead of at the tools, and needs extra rules, such as which URLs a tainted task may fetch.                                                                                 |
| keep the planner clean, as CaMeL does                                                           | CaMeL solves 77% of AgentDojo tasks against 84% undefended, at about 2.8 times the tokens on the median task, and its evaluation covers no multi-turn conversation ([CaMeL](https://arxiv.org/abs/2503.18813)). |
| clean a job through your approval                                                               | Claude Code users approve 93% of permission prompts ([Anthropic engineering](https://www.anthropic.com/engineering/claude-code-auto-mode)), so an approval says little about the content.                       |
| a model as the defence                                                                          | A classifier misses real overeager actions, so nixie keeps a model only as a layer that can tighten a decision.                                                                                                 |

## Consequences

- A search marks nothing, because the conversation is always untrusted.
- A job that sends free text to an allowed destination, such as a reply to a sender, can leak
  whatever its tools reach. The tool list limits that, and the job notice shows the list.
- A memory write applies at once only under the checks in [0011](0011-memory-writes.md).
- A known contact's compromised account can steer nixie into sends to that contact with no prompt,
  because you chose to trust that contact.

## Changes

- 2026-10-08: the conversation is always untrusted and carries no taint flag, and taint applies to
  jobs and workers in stages. The first version marked the conversation as tainted once it read free
  text, and counted a search API's results as typed.
- 2026-10-15: record 0015, Where taint applies, merged into this record.
