# Taint in practice

Report: 2.3

Sources were fetched on 2026-10-08 unless a different date is given with the source.

No system examined clears taint once untrusted content has entered an agent's context. Systems that
avoid label creep do it in 3 ways: they keep untrusted content out of the planner's context, they
let a disposable sub-context absorb it, or they scope the label to a boundary such as a turn, a task
or a session and start fresh after it. Research systems use the first 2, and OpenClaw, an
open-source assistant, uses the third, for memory alone. Shipping agents and browsers track no
taint, with one exception: an experimental FIDES flag in GitHub Copilot CLI. The rest rely on
classifiers, a checking model that never sees raw page content, origin limits, confirmations, and
isolation from the user's logins. Endorsement of a derived value exists only as a policy choice in
research systems, and no shipping product cleans an artifact through human approval.
[Policy models](policy-models.md#information-flow-and-taint) covers how CaMeL, FIDES, Progent and
the Rule of Two work.

## Systems

| System                  | Where the label applies                | How creep is avoided or cleared           | Cost                                | Source                                                                                |
| ----------------------- | -------------------------------------- | ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| CaMeL                   | Each value in an interpreter           | Planner never reads tool output           | 77% vs 84% tasks; about 2.8x tokens | [arXiv 2503.18813](https://arxiv.org/abs/2503.18813)                                  |
| FIDES                   | Planner context, plus hidden variables | Variable hiding; typed queries            | Not verified here                   | [arXiv 2505.23643v2](https://arxiv.org/html/2505.23643v2)                             |
| APPA                    | Each branch of the trajectory          | Disposable child branches                 | 64.2% to 91% utility kept           | [arXiv 2607.24625](https://arxiv.org/abs/2607.24625)                                  |
| RTBAS                   | Each real data dependency              | Taints only what an action depends on     | 2% utility loss under attack        | [arXiv 2502.08966](https://arxiv.org/abs/2502.08966)                                  |
| MemLineage              | Each memory entry and its lineage      | Never clears                              | Sub-millisecond                     | [arXiv 2605.14421](https://arxiv.org/abs/2605.14421)                                  |
| Rule of Two             | One session                            | New session with a fresh context          | Lost context                        | [Meta, 2025-10-31](https://ai.meta.com/blog/practical-ai-agent-security/)             |
| OpenClaw                | One turn, for memory only              | Resets at the next owner message          | Untrusted memories dropped          | [openclaw](https://github.com/openclaw/openclaw)                                      |
| agent-ifc               | One task                               | Resets at the next user turn              | Unmeasured                          | [agent-ifc](https://github.com/K20tg/agent-ifc)                                       |
| Hermes, IronClaw        | None                                   | Delimiters around untrusted text          | None                                | [hermes-agent](https://github.com/NousResearch/hermes-agent)                          |
| Gemini in Chrome        | Origins the agent may read or act on   | Critic never sees page content            | No figures                          | [Google, 2025-12-08](https://blog.google/security/architecting-security-for-agentic/) |
| Claude in Chrome        | None                                   | Probes and an action classifier           | 0% to 0.3% attacks, vendor-claimed  | [Anthropic, 2026-08-26](https://claude.com/blog/claude-in-chrome-generally-available) |
| ChatGPT agent and Atlas | None                                   | URL index, confirmations, logged-out mode | No figures                          | [OpenAI, 2026-01-28](https://openai.com/index/ai-agent-link-safety/)                  |
| Brave AI browsing       | A separate browser profile             | Never clears; profile stays isolated      | Separate logins                     | [Brave, 2026-05-05](https://brave.com/blog/ai-browsing/)                              |

## Research systems

### CaMeL

CaMeL keeps its planner clean by construction. The privileged LLM sees only the owner's query and
writes code, and tool outputs live in interpreter variables that it cannot read. Every value carries
its sources and its allowed readers. The quarantined LLM runs as a function inside the interpreter,
so its output inherits the labels of its inputs, and a Pydantic schema limits the shape of that
output without raising its trust. Nothing declassifies a value automatically. A policy can allow a
specific flow, and the paper proposes that a deployment ask the user to confirm a policy violation
instead of blocking it. CaMeL solves 77% of AgentDojo tasks against 84% undefended, at about 2.8
times the tokens on the median task. The evaluation covers single tasks, and the paper does not
treat multi-turn conversations. The repository is a research artifact whose last commit is dated
2025-06-20 ([CaMeL v2, 2025-06-24](https://arxiv.org/abs/2503.18813);
[camel-prompt-injection](https://github.com/google-research/camel-prompt-injection)).

### FIDES

FIDES keeps one context label for the planner, and that label only rises within a session. Its
answer to creep is variable hiding: a "Hide" step moves any part of a tool result labelled above the
current context into a fresh variable. The planner can pass the variable to tools without reading
it, so the context label stays where it was. An inspect action brings the variable into context and
raises the label for the rest of the session. The paper names needless inspection as a failure mode,
which is label creep in practice ([FIDES v2, 2025-09-03](https://arxiv.org/html/2505.23643v2)).

A typed query to the quarantined LLM keeps the untrusted label. A boolean drawn from untrusted data
gets the label `((U,L),bool)`, so the type is recorded next to the label and never replaces it. The
paper argues that "low capacity outputs are less useful to deliver prompt injection payloads or
exfiltrate information", which lets a policy accept them, "effectively offering declassification or
endorsement as escape hatches". Endorsement is therefore a policy decision about types, never a
property the label gains. On egress, FIDES enforces "a form of robust declassification": a flow that
starts in a trusted context may release data. Two summaries of the FIDES AgentDojo utility tables
disagreed, so this note gives no utility figures for FIDES.

Microsoft's post of 2026-06-16 pitches information-flow control as a replacement for human approval
prompts. It reports experimental support in GitHub Copilot CLI behind `FIDES_IFC=true`, and in
Microsoft Agent Framework through `SecureAgentConfig` with `auto_hide_untrusted=True` and
`approval_on_violation=True`. It reports that the GitHub MCP server labels tool results as public
and untrusted, or private and trusted
([Microsoft, 2026-06-16](https://commandline.microsoft.com/information-flow-control-moving-toward-secure-autonomous-agents/)).
The [fides-gateway](https://github.com/microsoft/fides-gateway) prototype is an MCP proxy with 1
commit, on 2026-06-16. It puts labels in request metadata keyed by JSONPath and checks tool calls
against Rego policies. Its README covers neither declassification nor a reset.

### APPA and RTBAS

APPA, from Archestra AI, is built around label creep. Its abstract states that monotone taint
tracking "permanently strands downstream execution once an agent ingests unvetted data". A risky
read runs in a disposable child branch that absorbs the taint, and the parent's label does not
change. The child returns through a schema declared in advance, and schema validation alone never
relaxes a label. On the authors' own benchmark it keeps 64.2% to 91% of utility with 0 successful
attacks across 1,320 guarded episodes. The paper has no AgentDojo run, and this note did not check
its tables by hand ([APPA v2, 2026-08-26](https://arxiv.org/abs/2607.24625)).

RTBAS narrows what gets tainted instead of clearing it. An LLM judge or attention saliency picks the
dependencies an action has, and only those carry taint. It blocks all targeted AgentDojo attacks for
a 2% utility loss under attack, and it asks the user only when it cannot show an action is safe
([RTBAS, 2025-02-13](https://arxiv.org/abs/2502.08966)).

### Lineage for created artifacts

MemLineage tracks the taint of what an agent creates. It signs every memory entry and records which
entries an LLM derived it from. Taint from an external ancestor persists along that graph and never
clears, and a gate refuses a sensitive action whose justification descends from external content. It
reports 0% attack success on 3 memory-poisoning workloads at sub-millisecond overhead
([MemLineage, 2026-05-14](https://arxiv.org/abs/2605.14421)).

### Rule of Two and design patterns

Meta's Rule of Two makes the session the unit, and a new session is the sanctioned reset. An agent
that needs all 3 properties "without starting a new session (i.e., with a fresh context window)"
needs human approval or another reliable check. The post describes a one-way switch as well: a
session starts with internet access and external communication, and drops communication for good
before it touches internal systems
([Meta, 2025-10-31](https://ai.meta.com/blog/practical-ai-agent-security/)).

The design-patterns paper lists 6 patterns. Context minimization drops earlier content from later
context, which is the closest any pattern comes to clearing taint by removing content. The paper
does not frame it as a reset across turns
([arXiv 2506.08837v3, 2025-06-27](https://arxiv.org/abs/2506.08837)).

## Production agents

None of the shipping agents examined marks a session as tainted, so none has anything to clear. Each
relies on a mix of model training, classifiers on incoming content, a checking model, origin limits,
confirmations and isolation. Every attack success rate below comes from the vendor's own testing.

- **Google, Gemini in Chrome.** The User Alignment Critic is a separate model that sees "only
  metadata about the proposed action and not any unfiltered untrustworthy web content", and it can
  veto an action. Agent Origin Sets split origins into read-only and read-write, and the planner
  "cannot add new origins without the gating function's approval". The origin set limits where data
  can go, and it marks no data. The post does not say whether a set resets per task
  ([Google, 2025-12-08](https://blog.google/security/architecting-security-for-agentic/)).
- **Anthropic, Claude in Chrome.** Probes scan web content that arrives in tool results. A
  classifier checks each planned action "against what you originally asked for" and blocks a
  mismatch. Anthropic reports 0% attack success for Opus 5 and Sonnet 5 with all safeguards, against
  3.8% for Opus 5 without them
  ([Anthropic, 2026-08-26](https://claude.com/blog/claude-in-chrome-generally-available)).
- **Anthropic, Claude Code.** For most fetches a separate model call reads the page, and the main
  model gets only that answer ([Claude Code security](https://code.claude.com/docs/en/security)).
  One researcher chained a WebFetch failure into running code 60% to 80% of the time in auto mode,
  and Anthropic called auto mode "a best-effort classifier, not a security guarantee"
  ([The Register, 2026-08-28](https://www.theregister.com/a/5293372)).
- **OpenAI, ChatGPT agent and Atlas.** The agent may open a URL on its own only when that exact URL
  sits in an index built by a separate crawler with no access to conversations. OpenAI states this
  stops leaks through URLs and does not make a page trustworthy
  ([OpenAI, 2026-01-28](https://openai.com/index/ai-agent-link-safety/)). Atlas offers a logged-out
  mode chosen before a task, which keeps accounts out of reach without resetting anything
  ([Atlas help](https://help.openai.com/en/articles/12628199)). A March 2026 post frames defence as
  a source paired with a sink and asks or blocks when conversation data would go to a third party.
  It was read through a proxy, and its date comes from an aggregator
  ([OpenAI](https://openai.com/index/designing-agents-to-resist-prompt-injection/)).
- **Microsoft, Copilot.** Edge allows a curated site list by default, and a strict mode asks per
  site. Prompt Shields scan page data, and a second model warns on task drift
  ([Microsoft Edge, 2025-10-23](https://blogs.windows.com/msedgedev/2025/10/23/considerations-for-safe-agentic-browsing/)).
  The FIDES work above is the only Microsoft taint tracking, and it is experimental.
- **Perplexity Comet and Brave.** Comet layers classifiers, prompts that mark web content as
  untrusted, and confirmations
  ([Perplexity, 2025-10-22](https://www.perplexity.ai/hub/blog/mitigating-prompt-injection-in-comet)).
  Brave runs its own agent only in a separate browser profile, and a checking model sees the request
  and the proposed action but never page content
  ([Brave, 2026-05-05](https://brave.com/blog/ai-browsing/)). Brave's independent research showed
  hidden page text taking over Comet accounts
  ([Brave, 2025-08-20](https://brave.com/blog/comet-prompt-injection/)).

## Open-source assistants

OpenClaw scopes taint to one turn and uses it only for memory. The notes below come from commit
`9658ea8` of 2026-10-08.

- A tool that declares `resultContentSource: "network"` taints the turn, which covers `web_fetch`,
  `web_search`, browser tools and every bundled MCP tool. Local file reads and `exec` never taint,
  and the docs name this gap in declaration coverage.
- Taint stays set for the rest of the turn, carries across retries, and resets when the next user
  message is committed (`packages/agent-core/src/turn-taint.ts`, `agent-loop.ts`). An unreadable
  transcript tail counts as tainted.
- Memory provenance is the only reader. A tainted assistant message gets the origin `untrusted`,
  recall injects only `owner` and `agent` rows, and dreaming drops `untrusted` candidates. No code
  path reclassifies an untrusted row.
- Cron jobs inherit no taint. Creating one needs an owner turn, and the job's tools are capped to
  the creator's tools. From reading the code, a network-tainted owner turn can create a cron job
  with the creator's full tool set; this is untested.

Hermes Agent wraps web, browser and MCP results in `untrusted_tool_result` delimiters and rejects
forged tags, and records nothing about a turn having seen them (commit `08165d5`). IronClaw asks for
approval by effect kind with no provenance input, and wraps untrusted memory and skill content in a
prompt envelope (commit `b0b999d`). Invariant Guardrails matches ordered patterns over a whole
trace, such as a website read followed by an email send, and nothing in a trace ever clears
([invariant](https://github.com/invariantlabs-ai/invariant)). agent-ifc, a hobby project, computes
taint from tool results since the last user turn, so it clears per task. Content written to a file
and read back keeps its taint there, and only the harness can call its approval actions
([agent-ifc](https://github.com/K20tg/agent-ifc), commit `6483afb`).

## Declassification and rubber-stamping

Robust declassification is the classic rule for a downgrade step: an attacker who controls
low-integrity data must not influence what gets declassified, or whether
([Zdancewic and Myers, CSFW 2001](https://www.cs.cornell.edu/zdance/robust_declassification.htm)).
Myers, Sabelfeld and Zdancewic extend the rule to endorsement as qualified robustness
([JCS 2006](https://www.cse.chalmers.se/~andrei/msz-jcs.pdf)). Applied to a human approval, the rule
holds only if untrusted content shaped neither the prompt the human sees nor the decision to ask. An
approval prompt written by a tainted model fails the rule.

FIDES claims a form of robust declassification, and agent-ifc lets the model call `declassify` and
`endorse` but checks the result against an invariant that protected targets never pass. Claude Code
auto mode applies the same idea to approvals: its classifier "sees only user messages and the
agent's tool calls", with tool outputs stripped as "the primary prompt-injection defense". The same
post reports that users approve 93% of permission prompts
([Anthropic, 2026-03-25](https://www.anthropic.com/engineering/claude-code-auto-mode)). A 2026 paper
argues that escalating to a fatiguing human too often lowers safety
([arXiv 2606.08919](https://arxiv.org/abs/2606.08919)). CaMeL names user fatigue and argues its
policies cut how often users are asked. No system examined lets a human approval reclassify a
tainted artifact as clean.

OpenClaw has one route back into trusted memory: the owner restates the fact in a trusted channel,
and OpenClaw records the new row as `owner`. This route is robust by construction, because untrusted
content shaped neither the prompt nor the decision. Hermes Agent stages memory and skill writes for
the owner's approval, but a fixed setting turns the staging on, and the content's source plays no
part.

## Patterns

- **Avoidance.** The planner never reads untrusted content, so its label never rises: CaMeL, FIDES
  variable hiding, and the dual-LLM pattern.
- **Confinement.** A disposable sub-context absorbs the taint and returns a shaped result that keeps
  its label: APPA branches, LLM map-reduce, and Brave's separate profile.
- **Scoped reset.** The label lasts until a boundary, then starts fresh: OpenClaw per turn,
  agent-ifc per task, and the Rule of Two per session.
- **Lineage that persists.** Created artifacts keep their origin for good: MemLineage, and the
  OpenClaw origin column.
- **No taint.** A checking model that never sees raw content judges each action against the request:
  Google, Anthropic, Brave.

Endorsement of bounded types, as FIDES allows, sits across these patterns as a policy choice.

## Worth borrowing

- a per-turn or per-task taint scope that resets at the owner's next message, as OpenClaw and
  agent-ifc do, for the live thread
- persistent origin on created artifacts such as memories, rules and jobs, independent of the live
  thread's taint
- variable hiding, so the main thread can pass a search result to a tool without reading it
- typed outputs that keep their label, with any endorsement written as an explicit policy over the
  type
- an action check whose inputs are the owner's messages and the proposed action, never tool output,
  as robust declassification requires
- an approval prompt built from structured fields that the tainted model did not write
- the owner restating a fact in a trusted channel as the route from untrusted to trusted memory, as
  OpenClaw allows

## Worth avoiding

- a monotone session label with no scope, which APPA describes as stranding all later work
- treating a typed or schema-validated output as clean, which neither CaMeL nor FIDES nor APPA does
- taint read only by memory, so a tainted turn can still create a cron job with full tools, as the
  OpenClaw code suggests
- human approval as a cleaning step, given a 93% approval rate and no system that applies it
- classifier-only defence, where the vendor figures are self-reported and an independent attack beat
  auto mode 60% to 80% of the time
