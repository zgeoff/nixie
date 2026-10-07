# Approvals and owner friction

Report: 2.3

Sources were fetched on 2026-10-07 unless a different date is given with the source.

The strongest approval pattern stores a structured record shaped like the RFC 9396
`authorization_details`, binds it to a hash of the exact action as AP2 does, gives it a short
expiry, and consumes it atomically once ([RFC 9396](https://www.rfc-editor.org/rfc/rfc9396.html);
[AP2 specification](https://ap2-protocol.org/ap2/specification/);
[OpenAI Agents SDK HITL](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)).
Coding CLIs turn "always" into a rule the owner can read, and agent frameworks keep no durable
"always". Owner friction is the weak point. Shipping products cut prompts with LLM classifiers as
their main gate, which nixie's deterministic layers rule out; a classifier can still decide what
those layers leave open, as [decision 0008](../../decisions/0008-auto-mode.md) records.
Deterministic precedent for low friction is thin: digest approvals have no shipping precedent, and
only one product proposes rules from approvals. [Policy models](policy-models.md) covers the
decision point that asks for these approvals.

## Durable grants

Coding CLIs persist "don't ask again" as a rule built from the approved call:

- Claude Code shows the rule it will save, such as "Yes, and don't ask again for: npm test \*". From
  v2.1.211, it writes the rule to `.claude/settings.local.json` at the repo root. It offers "always"
  only when the prompt can show everything the rule allows, and it evaluates deny, then ask, then
  allow ([Claude Code permissions](https://code.claude.com/docs/en/permissions)).
- Codex writes Starlark `prefix_rule` entries to `~/.codex/rules/default.rules`, where the most
  restrictive decision wins
  ([Codex rules](https://learn.chatgpt.com/docs/agent-configuration/rules.md)).
- Gemini CLI 0.63.0 writes TOML rules with `toolName` and an optional `argsPattern` to
  `~/.gemini/policies/auto-saved.toml`. It scopes grants by mode, so a `yolo` approval does not
  apply in stricter modes
  ([Gemini CLI policy engine](https://geminicli.com/docs/reference/policy-engine.md)).
- The Copilot CLI session grant covers a tool "with any options"
  ([Copilot CLI docs](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli)).

These rules match command text by prefix or regex, not by what a call touches. A September 2026
paper calls the resulting gap "approval laundering": the record holds the entry command but not the
effects its workflow exercises
([Zhang et al., arXiv 2609.28586](https://arxiv.org/abs/2609.28586v1)).

Agent frameworks keep no durable "always". The OpenAI Agents SDK JS 0.19 offers a sticky
`alwaysApprove` only for the rest of a run
([Agents SDK HITL](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)). Vercel AI
SDK 7, LangChain, and Mastra decide per call
([AI SDK](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling);
[LangChain HITL](https://docs.langchain.com/oss/javascript/langchain/human-in-the-loop);
[Mastra](https://mastra.ai/docs/agents/agent-approval)). The notes found no product that expires a
permanent grant by time: a grant lasts a session, a run, or until someone deletes the rule.

## Binding an approval to one action

Exact-action binding comes from payments standards, not from OAuth. Standards offer 3 ways to bind a
grant to an action:

- Structured JSON in the grant. RFC 9396, Rich Authorization Requests (RAR), of May 2023, adds
  `authorization_details`: typed objects with `actions`, `locations`, and `identifier`, as in
  "transfer 45 Euros to Merchant A". It warns that clients "MUST protect authorization_details
  against tampering", and it defines no one-time use
  ([RFC 9396](https://www.rfc-editor.org/rfc/rfc9396.html)). The Grant Negotiation and Authorization
  Protocol (GNAP), RFC 9635 of October 2024, uses the same shape in its `access` array and binds
  tokens to keys by default ([RFC 9635](https://www.rfc-editor.org/rfc/rfc9635.html)).
- A hash of a signed artifact. AP2 v0.2, announced on 2025-09-16, binds its Payment Mandate to "the
  cryptographic hash of the Checkout JWT" through `checkout_hash`, and it sets `exp` "to the
  smallest value" the task needs ([AP2 specification](https://ap2-protocol.org/ap2/specification/)).
- A capped single-use allowance. The OpenAI and Stripe Delegated Payment spec, at API-Version
  2025-09-29, carries `reason: "one_time"`, `max_amount`, `merchant_id`, `expires_at`, and an
  Idempotency-Key. A reuse of the key with changed parameters returns 409
  ([OpenAI Delegated Payment Spec](https://developers.openai.com/commerce/specs/payment)).

By contrast, the `binding_message` in Client-Initiated Backchannel Authentication (CIBA) is only a
display correlator
([OpenID CIBA Core](https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html)).

Products bind the same way. Mastra's "approval fingerprinting" ties an approval to the exact tool
name and arguments "to prevent drift between review and execution"
([Mastra](https://mastra.ai/docs/agents/agent-approval)). IronClaw fingerprints its one-shot lease
to the exact invocation and stores durable grants under `/approvals/persistent`
([IronClaw](https://github.com/nearai/ironclaw)).

## Replay protection

Replay protection is the application's job, because expiry alone does not stop replay. Transaction
Tokens, in draft-ietf-oauth-transaction-tokens-11 of 2026-07-30, are short-lived but "not resistant
to replay attacks". The draft directs the receiver to store each `txn` for the acceptance window
([datatracker](https://datatracker.ietf.org/doc/draft-ietf-oauth-transaction-tokens/)).

The OpenAI Agents SDK gives the most explicit guidance for approvals arriving from a browser or
phone ([Agents SDK HITL](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)):

- Keep snapshots server-side.
- Send clients only opaque IDs.
- Authenticate reviewers.
- Check decision IDs against stored pending requests.
- "atomically consume approvals before deserialization to prevent replay attacks"

### Resume semantics

How a runtime resumes after an approval decides whether side effects repeat and whether an early
approval is lost:

- A LangGraph node re-runs from the top on resume, so any side effect before `interrupt()` runs
  twice ([LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)).
- Cloudflare Workflows buffers an event that arrives before its wait
  ([Cloudflare](https://developers.cloudflare.com/workflows/build/events-and-parameters/)).
- An Inngest wait "only sees events sent after it starts listening"
  ([Inngest](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event)).
- Restate awakeables and Temporal signals are durable
  ([Restate](https://docs.restate.dev/develop/ts/awakeables);
  [Temporal](https://docs.temporal.io/develop/typescript/message-passing)).
- The Claude Agent SDK lets a PreToolUse hook return `defer`, so the process can exit and resume
  later from the persisted session
  ([Agent SDK user input](https://code.claude.com/docs/en/agent-sdk/user-input)).

## Delegation

Delegation may only narrow a grant, and no standard covers sub-agents. RFC 8693, of January 2020,
records a delegation chain in nested `act` claims. Only the outermost, current actor counts for
access control, and `may_act` lists who may act
([RFC 8693](https://www.rfc-editor.org/rfc/rfc8693.html)). Transaction Tokens keep `txn`, `sub`, and
`aud` fixed down a call chain, and the token service "MUST ensure that the requested scope ... does
not expand" ([datatracker](https://datatracker.ietf.org/doc/draft-ietf-oauth-transaction-tokens/)).
AP2 delegates by putting the agent's key in the `cnf` claim of an open mandate, which the agent then
closes per action ([AP2 specification](https://ap2-protocol.org/ap2/specification/)).

As of 2026-10-07, the OAuth working group has adopted no draft that covers agent sub-delegation:

- draft-araut-oauth-transaction-tokens-for-agents-02, of 2026-05-22, is an individual draft
  ([datatracker](https://datatracker.ietf.org/doc/draft-araut-oauth-transaction-tokens-for-agents/)).
- The WSO2 on-behalf-of draft has expired
  ([datatracker](https://datatracker.ietf.org/doc/draft-oauth-ai-agents-on-behalf-of-user/)).
- draft-ietf-wimse-aims-00, of 2026-09-15, is Informational. It composes OAuth, Transaction Tokens,
  CIBA, and the Shared Signals Framework, and it states "LLMs must not access agent credentials"
  ([datatracker](https://datatracker.ietf.org/doc/draft-ietf-wimse-aims/)).

In products, a Claude Code subagent runs in its parent's permission mode
([Agent SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions)). Nested approvals
appear on the root run in the OpenAI Agents SDK and bubble up to the supervisor in Mastra
([Agents SDK HITL](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/);
[Mastra](https://mastra.ai/docs/agents/agent-approval)).

## Phone approval

Standards exist for approval on a second device, but the action hash stays with the host. CIBA,
Final since 2021-09-01, returns an `auth_req_id` with at least 128 bits of entropy, an expiry, and
poll, ping, or push delivery
([OpenID CIBA Core](https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html)).
GNAP supports asynchronous authorization natively, with `user_code` start modes and push finish
([RFC 9635](https://www.rfc-editor.org/rfc/rfc9635.html)). Auth0 sells CIBA plus RAR for agents, but
it requires an Enterprise plan or add-on
([Auth0 CIBA docs](https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-initiated-backchannel-authentication-flow);
[Auth0 for AI Agents](https://auth0.com/ai/docs/intro/asynchronous-authorization)).

The MCP spec at revision 2026-07-28 defines no binding between an approval and an action. Hosts
SHOULD keep "a human in the loop" and "show tool inputs to the user before calling the server"
([MCP Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)). MCP offers 2
hooks for a host's own flow:

- URL-mode elicitation handles "sensitive interactions that must _not_ pass through the MCP client".
  The client must show the full URL, and the server must verify that the same user finished the
  flow. An `accept` means only consent to open the URL
  ([MCP Elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)).
- The tasks extension adds an `input_required` state whose task IDs survive disconnects
  ([MCP Tasks](https://modelcontextprotocol.io/extensions/tasks/overview)).

The 2026-07-28 revision removes `elicitationId`, forbids token passthrough, and requires
audience-bound tokens through RFC 8707
([MCP Changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)). Its scope
challenges can depend on request arguments, but scopes remain coarse strings
([MCP Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)).

In products, Claude Code shows permission prompts in claude.ai and the mobile app for cloud and
Remote Control sessions
([Claude Code permission modes](https://code.claude.com/docs/en/permission-modes)). The
[2.1 research of IronClaw](../2.1-notes/nanoclaw-ironclaw-zeroclaw.md) found that the IronClaw
CHANGELOG lists a fix for cross-channel approval hijack
([IronClaw](https://github.com/nearai/ironclaw)).

## Approval fatigue

Approval fatigue is real and well measured:

- "Claude Code users approve 93% of permission prompts"
  ([Anthropic engineering, 2026-03-25](https://www.anthropic.com/engineering/claude-code-auto-mode)).
  A later Claude blog post puts the figure at 97%
  ([Claude blog](https://claude.com/blog/auto-mode-default-in-claude-code)).
- In 2012, 17% of Android users paid attention to install permissions
  ([Felt et al.](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2012/EECS-2012-26.html)).
- Clickthrough on Chrome SSL warnings reached 70.2%
  ([Akhawe & Felt](https://www.usenix.org/conference/usenixsecurity13/technical-sessions/presentation/akhawe)).
- In a simulation, a buried malicious action succeeded 40% of the time under an 88% escalation
  policy, against 0% under a load-aware 26% policy
  ([Turan, arXiv 2606.08919](https://arxiv.org/html/2606.08919v1)). That result comes from
  simulation only, with no human subjects.

## Low-friction options

Shipping products cut friction in 3 ways: they contain actions so the actions need no prompt, put an
LLM reviewer in front of the human, and turn an approval into a rule. Deterministic precedent for
low friction is thin.

### Containment and LLM reviewers

Sandboxing "safely reduces permission prompts by 84%" in Anthropic's internal use
([Anthropic engineering, 2025-10-20](https://www.anthropic.com/engineering/claude-code-sandboxing)).
The LLM reviewers are Claude Code auto mode, the default from v2.1.283, Codex `auto_review`, and
Cursor Auto-review
([Claude Code permission modes](https://code.claude.com/docs/en/permission-modes);
[Codex auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review);
[Cursor run modes](https://cursor.com/docs/agent/security/run-modes.md)). All 3 are models. The full
auto mode pipeline has a 17% false-negative rate on real overeager actions
([Anthropic engineering](https://www.anthropic.com/engineering/claude-code-auto-mode)), and Cursor
calls its reviewer "not a security boundary". None of the reviewers can be nixie's main gate. One
can decide what nixie's deterministic layers leave open, as
[decision 0008](../../decisions/0008-auto-mode.md) records for auto-mode.

### Learned rules with owner confirmation

Every coding CLI turns one approval into a rule the user can read, as
[Durable grants](#durable-grants) describes. Only Codex goes further: "Smart approvals may propose
rules automatically", and Codex labels its rules experimental. The notes found no documentation of
how smart approvals work, or of a flow where the owner confirms the rule later
([Codex rules](https://learn.chatgpt.com/docs/agent-configuration/rules.md)).

The Claude Agent SDK passes ready-made `suggestions` to the approval callback. The app echoes one
back to save it, and `suppressAlwaysAllowRule` stops the app from offering always-allow
([Agent SDK user input](https://code.claude.com/docs/en/agent-sdk/user-input)). Progent supplies the
safety check such a feature needs: a narrowing update applies automatically, and a widening one
needs approval. Only 6% of Progent policy updates were expansions
([Progent, arXiv v3](https://arxiv.org/html/2504.11703v3)). One survey cites research showing that
LLMs predict user approval decisions with 85.1% accuracy
([Wang et al., arXiv 2605.24309](https://arxiv.org/html/2605.24309v1)).

### Risk-tiered defaults

Felt et al. recommended matching the grant mechanism of each permission to its risk: automatic
grant, trusted UI, confirmation, or install-time warning
([USENIX HotSec 2012](https://www.usenix.org/conference/hotsec12/workshop-program/presentation/felt)).
The Chrome agent keeps confirmation only for sensitive sites, sign-in, payments, and sent messages
([Google blog](https://blog.google/security/architecting-security-for-agentic/)). Microsoft's FIDES
deployment asks the user "only when it genuinely matters", for example when an action would reveal
data to someone without access
([Microsoft blog](https://commandline.microsoft.com/information-flow-control-moving-toward-secure-autonomous-agents/)).

Taint has a measurable cost. CaMeL's policies fired on about 10-30% of benign Workspace tasks, and
utility fell from 84% to 77% ([CaMeL, arXiv v2](https://arxiv.org/html/2503.18813v2)). FIDES
recovers utility by hiding tool results in variables and asking a quarantined LLM for a bool or
enum. FIDES reaches only 50-70% of the maximum on data-dependent tasks
([FIDES, arXiv v2](https://arxiv.org/html/2505.23643v2)). The design-patterns paper rates
plan-then-execute and dual-LLM as moderate-cost ways to let a task read untrusted data without
acting on it ([arXiv 2506.08837](https://arxiv.org/html/2506.08837)).

### Batching and digest approvals

LangChain batches all parallel tool calls into one interrupt
([LangChain HITL](https://docs.langchain.com/oss/javascript/langchain/human-in-the-loop)). In a CHI
'26 study with n=48, 81% preferred confirming at intermediate points over confirming at the end, and
task time fell 13.54% ([Zhou et al., arXiv 2510.05307](https://arxiv.org/abs/2510.05307)). The notes
found no shipping product with digest or end-of-day approvals. Plan-level approval appears only in a
survey ([Wang et al.](https://arxiv.org/html/2605.24309v1)). With little precedent, nixie would
design digest approvals from first principles.

## Recommended approval record

The report recommends an approval record built from the strongest binding, replay, and delegation
patterns:

- Store a record shaped like RAR `authorization_details`
  ([RFC 9396](https://www.rfc-editor.org/rfc/rfc9396.html)).
- Bind the record to a hash of the canonical action, as AP2 does
  ([AP2](https://ap2-protocol.org/ap2/specification/)).
- Give the record an expiry sized to the task.
- Consume the record atomically once, as Transaction Tokens and the Agents SDK advise
  ([Txn-Tokens](https://datatracker.ietf.org/doc/draft-ietf-oauth-transaction-tokens/);
  [Agents SDK HITL](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)).
- Keep durable grants as Cedar policies, so "always allow" is ordinary owner-editable data.
- Let a grant to a sub-agent only narrow, and keep the `act` chain in the record
  ([RFC 8693](https://www.rfc-editor.org/rfc/rfc8693.html)).
- For phone approval, reproduce the CIBA pattern without an identity provider: an opaque ID, a push
  that shows the structured details, an expiry, and a response bound to the owner's identity on that
  channel
  ([CIBA](https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html)).
- Require owner confirmation for rules suggested from approvals, and apply the Progent check:
  narrowing is safe, and widening needs a yes ([Progent](https://arxiv.org/html/2504.11703v3)).

## Friction trade-off

Products that feel frictionless get there with LLM classifiers as the main gate: Claude Code auto
mode is the default from v2.1.283
([Claude Code permission modes](https://code.claude.com/docs/en/permission-modes)). nixie keeps its
deterministic layers final and uses a classifier only where they leave an action open, as
[decision 0008](../../decisions/0008-auto-mode.md) records. Structure carries the rest of the
friction budget:

- sandboxing, which cut prompts by 84% at Anthropic
  ([Anthropic engineering](https://www.anthropic.com/engineering/claude-code-sandboxing))
- tasks that produce drafts instead of sends
- rules the owner confirms once

## Worth borrowing

- an approval record shaped like RAR `authorization_details`, bound to an AP2-style action hash,
  with a short expiry and atomic single use
- the Agents SDK handling of remote approvals: server-side snapshots, opaque IDs, authenticated
  reviewers, and decision IDs checked against stored pending requests
- the Claude Code practice of showing the rule before saving it, and offering "always" only when the
  prompt shows everything the rule allows
- Gemini CLI's mode-scoped grants
- delegation that only narrows, with the `act` chain kept in the record
- the CIBA pattern for phone approval, without an identity provider
- a hook `defer` that lets the process exit and resume from the persisted session
- rule suggestions from approvals, confirmed by the owner and checked for widening
- risk-tiered defaults, batched parallel calls, and confirmation at intermediate points

## Worth avoiding

- rules that match command text by prefix or regex, which allow approval laundering
- session grants that cover a tool "with any options"
- display-only binding, such as the CIBA `binding_message`
- side effects before an interrupt in a node that re-runs on resume
- waits that miss an approval sent before they start listening
- LLM reviewers as the decision point

## Open questions

- How should a digest approval bind several actions, given that no product precedent exists? One
  option is one hash per action, collected in one approval sheet.
- Does nixie's durable runner buffer an approval that arrives before its wait registers? Cloudflare
  does and Inngest does not
  ([Cloudflare](https://developers.cloudflare.com/workflows/build/events-and-parameters/);
  [Inngest](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event)).
- Should a durable "always allow" expire? The notes found no product that does this.
