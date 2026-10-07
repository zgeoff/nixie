# Policy models

Report: 2.3

Sources were fetched on 2026-10-07 unless a different date is given with the source.

None of the policy models compared here meets all of nixie's principles alone, and a mix of 3 layers
comes closest. The rule layer is Cedar, the only engine here that runs in-process in Bun and returns
the IDs of the rules that decided
([Cedar docs: Authorization](https://docs.cedarpolicy.com/auth/authorization.html)). The effect
layer is a typed-effect classifier: nixie's own tool registry declares what each tool does, such as
read, write, send, or spend, as IronClaw does
([capability.rs](https://github.com/nearai/ironclaw/blob/main/crates/contracts/ironclaw_host_api/src/capability.rs)).
The taint layer is a session rule in the style of FIDES and the Rule of Two: once a task reads
untrusted content, its egress, write, and financial sinks close or need approval
([FIDES, arXiv 2505.23643](https://arxiv.org/html/2505.23643v2);
[Meta AI blog](https://ai.meta.com/blog/practical-ai-agent-security/)). TypeScript has no library
for agent information-flow control (IFC), so nixie would port the taint layer itself from Python
reference code ([microsoft/fides](https://api.github.com/repos/microsoft/fides);
[sunblaze-ucb/progent](https://github.com/sunblaze-ucb/progent)). [Approvals](approvals.md) covers
how the owner approves what these layers hold back.

## Policy models compared

| Model                      | Version and date                            | In-process in Bun     | Rule ID in decision | Owner editing               | Agent-security use | Fit for nixie       |
| -------------------------- | ------------------------------------------- | --------------------- | ------------------- | --------------------------- | ------------------ | ------------------- |
| Cedar                      | v4.13.0, `cedar-wasm` 4.13.0, 2026-09-15    | Yes, through WASM     | Yes                 | Strong, in the WASM package | AgentCore, Strands | Rule layer          |
| Open Policy Agent (OPA)    | v1.21.1, 2026-09-29                         | Precompiled WASM only | No                  | Go binaries                 | fides-gateway      | Weak                |
| Oso / Polar                | npm `oso` 0.27.3, 2024-01-13                | No                    | Not covered         | Not covered                 | None found         | Poor                |
| CEL                        | `cel-js` 8.0.0, 2026-07-07                  | Yes, pure JS          | No                  | Type checking               | agentgateway       | Argument predicates |
| ReBAC: OpenFGA and SpiceDB | v1.22.0, 2026-10-06; v1.56.2, 2026-09-11    | No, Go servers        | No, a boolean       | Modelling DSL               | Auth0 FGA          | Too heavy           |
| Typed-effect classifier    | IronClaw v1.4.1                             | Pattern, Rust code    | No                  | TOML policy file            | IronClaw           | Effect layer        |
| Capability systems         | SES 2.3.0, 2026-08-13; `biscuit-wasm` 0.6.0 | Untested              | No                  | Code, not owner data        | Agoric, MetaMask   | Plugin isolation    |
| Information flow and taint | CaMeL, FIDES, Progent, Rule of Two          | No TS implementation  | Provenance, not IDs | Research systems            | FIDES behind flags | Taint layer, ported |

Sources for the table, in row order:
[Cedar releases](https://api.github.com/repos/cedar-policy/cedar/releases/latest),
[cedar-wasm on npm](https://registry.npmjs.org/@cedar-policy/cedar-wasm/latest),
[Cedar syntax docs](https://docs.cedarpolicy.com/policies/syntax-policy.html),
[AWS What's New 2026-03-03](https://aws.amazon.com/about-aws/whats-new/2026/03/policy-amazon-bedrock-agentcore-generally-available/),
[cedar-for-agents](https://raw.githubusercontent.com/cedar-policy/cedar-for-agents/main/README.md),
[Classmethod DevelopersIO](https://dev.classmethod.jp/en/articles/strands-agents-cedar/);
[OPA releases](https://api.github.com/repos/open-policy-agent/opa/releases/latest),
[OPA Wasm docs](https://www.openpolicyagent.org/docs/wasm),
[opa-wasm on npm](https://registry.npmjs.org/@open-policy-agent/opa-wasm/latest),
[Regal](https://api.github.com/repos/open-policy-agent/regal/releases/latest),
[fides-gateway](https://github.com/microsoft/fides-gateway);
[osohq/oso](https://github.com/osohq/oso),
[Oso local authorization](https://www.osohq.com/docs/authorization-data/local-authorization);
[cel-js README](https://raw.githubusercontent.com/marcbachmann/cel-js/main/README.md),
[cel-es README](https://raw.githubusercontent.com/bufbuild/cel-es/main/README.md),
[agentgateway MCP authz](https://agentgateway.dev/docs/standalone/latest/configuration/security/mcp-authz/);
[OpenFGA setup](https://openfga.dev/docs/getting-started/setup-openfga/overview),
[SpiceDB releases](https://api.github.com/repos/authzed/spicedb/releases/latest),
[Auth0 FGA lab](https://developer.auth0.com/resources/labs/authorization/building-rag-apps-with-llamaindex-and-fga);
[IronClaw README](https://github.com/nearai/ironclaw),
[builtin_capability_policy.toml](https://github.com/nearai/ironclaw/blob/main/crates/app/ironclaw_composition/src/builtin_capability_policy.toml);
[Endo repo](https://github.com/endojs/endo),
[biscuit-wasm on npm](https://registry.npmjs.org/@biscuit-auth/biscuit-wasm/latest);
[CaMeL](https://arxiv.org/abs/2503.18813), [FIDES](https://arxiv.org/abs/2505.23643),
[Microsoft blog 2026-06-16](https://commandline.microsoft.com/information-flow-control-moving-toward-secure-autonomous-agents/),
[Progent](https://arxiv.org/abs/2504.11703).

Cedar's agent-security uses are AWS Bedrock AgentCore Policy, in preview from 2025-12-02 and
generally available from 2026-03-03, cedar-for-agents v0.6.1 of 2026-09-22, and Strands Agents,
reported on 2026-07-23. Auth0 FGA applies ReBAC to agent and retrieval-augmented generation (RAG)
resource access, in a lab dated 2025-02-07. Relationship-based access control (ReBAC) can cover
ground that Cedar entity hierarchies cover too, and both ReBAC servers are too heavy for one owner.
The Common Expression Language (CEL) row includes `@bufbuild/cel` 0.6.1, a beta of 2026-08-27.
`biscuit-wasm` 0.6.0 dates to 2025-09-26, and Agoric and MetaMask run SES in production. Progent has
an LLM draft its policy.

## Cedar

Cedar runs in-process in Bun, returns the rules behind each decision, gives the owner an editing
path, and has the most concrete agent-security adoption of the models here.

### Runtime and speed

Cedar runs fully in-process. 2 local runs on Bun 1.4.2 loaded `@cedar-policy/cedar-wasm` 4.13.0
through its `/nodejs` entry:

- In the researcher's run, 1,000 sequential `isAuthorized` calls took 74.3 ms, about 0.07 ms per
  decision, with the policy text re-parsed on each call.
- In an independent rerun, 1,000 decisions took 116 ms, about 0.12 ms each.

The package README documents Webpack and Vite and leaves Bun out, so Bun support rests on these
local runs
([cedar-wasm README](https://raw.githubusercontent.com/cedar-policy/cedar/main/cedar-wasm/README.md)).
Cedar denies by default, and "any satisfied `forbid` policy _overrides_" a permit
([Cedar docs: Authorization](https://docs.cedarpolicy.com/auth/authorization.html)).

### Rule IDs in decisions

Cedar is the only engine here whose response identifies its cause. A response holds the decision,
"Determining policies: The set of policy IDs that led to the decision", and the IDs of policies that
errored ([Cedar docs: Authorization](https://docs.cedarpolicy.com/auth/authorization.html)).

The `@id` annotation does not set the ID through the API. "An annotation has no impact on policy
evaluation", and only the CLI reads `@id`
([Cedar docs: Policy syntax](https://docs.cedarpolicy.com/policies/syntax-policy.html)). The caller
sets the IDs instead, through the keys of the policy map it passes:

- In the researcher's run, a policy set passed as one string came back as `"reason":["policy0"]`.
  The same set, passed as a map keyed by rule name, returned
  `{"decision":"deny","diagnostics":{"reason":["forbid-send-external"],"errors":[]}}`: a forbid
  overriding a permit, under the caller's own ID.
- In the rerun, a map keyed by rule name returned those names in `diagnostics.reason`. An allow came
  from `allow-owner-send`, and a deny came from `forbid-send-external`, which overrode it.

Template links keep their link IDs. `policyToJson` exposes annotations such as `@reason`, so a host
can attach human-readable text to an audit record. A deny with an empty `reason` means no permit
matched. That is a distinct state, and it is the trigger for asking the owner.

### Owner editing

Cedar gives an owner the best editing path that runs in-process. In the researcher's run, `validate`
caught a typo in `context.extrnal`, returned "did you mean `external`?", and gave character offsets
for highlighting. The same package exports a formatter, parse checks, and templates with
`?principal` slots, so a UI can offer fill-in-the-blank rules
([cedar-wasm on npm](https://registry.npmjs.org/@cedar-policy/cedar-wasm/latest)). cedar-for-agents
ships a WASM generator that builds Cedar schemas from MCP tool descriptions for JS and TS
([cedar-for-agents README](https://raw.githubusercontent.com/cedar-policy/cedar-for-agents/main/README.md)).

One check is missing in-process. The question "does this edit widen permissions?" belongs to Cedar's
Lean-based analysis tooling, and the notes did not verify that the tooling runs inside Bun.

### Agent-security adoption

AWS Bedrock AgentCore Policy went generally available on 2026-03-03. AgentCore turns
natural-language policies into Cedar and evaluates every agent-tool request at a gateway
([AWS What's New](https://aws.amazon.com/about-aws/whats-new/2026/03/policy-amazon-bedrock-agentcore-generally-available/)).
Strands Agents evaluates "Cedar policies ... before every tool call", with principal = user and
action = tool name
([Classmethod DevelopersIO, 2026-07-23](https://dev.classmethod.jp/en/articles/strands-agents-cedar/)).

## Other rule languages

Each of the other rule languages misses at least one of nixie's requirements.

### OPA

OPA runs in-process only as a precompiled Rego-to-WASM module. Compiling the module needs the `opa`
binary at build time. A module allows one entrypoint per instantiation and lacks some built-ins,
such as `http.send` ([OPA docs: Wasm](https://www.openpolicyagent.org/docs/wasm)). The JS SDK has
not shipped since 1.10.0 on 2024-11-08
([npm](https://registry.npmjs.org/@open-policy-agent/opa-wasm/latest)). The notes did not run an
end-to-end OPA evaluation in Bun.

OPA output is `[{"result": <value>}]`, so a policy author must encode the rule ID in the result.
Owner editing relies on the Regal linter and `opa check`, which are both Go binaries that run out of
process.

OPA's founding maintainers moved to Apple around August 2025, and OPA remains under the Cloud Native
Computing Foundation (CNCF)
([OpenSourceForU](https://www.opensourceforu.com/2025/08/apple-acquires-open-policy-agent-developers-while-cncf-retains-control-of-open-source-project/)).
The project is active, with v1.21.1 on 2026-09-29
([GitHub API](https://api.github.com/repos/open-policy-agent/opa/releases/latest)). The
rule-language research found no dated agent-security use of OPA. The information-flow research found
one: microsoft/fides-gateway, a research prototype of an MCP gateway updated on 2026-09-30, writes
its label policies in Rego ([fides-gateway](https://github.com/microsoft/fides-gateway)).

### Oso

Oso's open-source library is deprecated, though not end-of-lifed. Oso Cloud's "Local Authorization"
calls the cloud and returns SQL for the app to run ([osohq/oso](https://github.com/osohq/oso);
[Oso docs](https://www.osohq.com/docs/authorization-data/local-authorization)).

### CEL

CEL runs in Bun in pure JS, which a local test in Bun confirmed. `@marcbachmann/cel-js` 8.0.0 has an
Environment API with type checking. `@bufbuild/cel` 0.6.1 is labelled beta
([cel-js README](https://raw.githubusercontent.com/marcbachmann/cel-js/main/README.md);
[cel-es README](https://raw.githubusercontent.com/bufbuild/cel-es/main/README.md)).

CEL is an expression language, not a policy model. An expression yields a value, so the host must
keep a rule ID per expression. agentgateway uses CEL for MCP tool authorization and OR-combines CEL
rules over `mcp.tool.name` and `mcp.tool.arguments`
([agentgateway docs](https://agentgateway.dev/docs/standalone/latest/configuration/security/mcp-authz/)).
CEL could serve nixie for argument predicates, but nixie would build the policy model and the audit
around it.

### ReBAC

OpenFGA and SpiceDB run only as Go servers, and their JS packages are clients. SpiceDB's in-memory
store is meant for testing
([OpenFGA setup](https://openfga.dev/docs/getting-started/setup-openfga/overview);
[SpiceDB datastores](https://authzed.com/docs/spicedb/concepts/datastores)). Auth0 FGA, built on
OpenFGA, targets agent access to resources
([Auth0 FGA](https://auth0.com/fine-grained-authorization.md)).

## Typed effects

IronClaw shows the typed-effect layer in shipping code. Its `EffectKind` enum covers
`ReadFilesystem`, `Network`, `UseSecret`, `DispatchCapability`, `ModifyApproval`, `Financial`, and
others. A gate matrix keyed by origin (`LoopRun`, `Product`, `Automation`) treats an origin with no
declaration as `Forbidden`. A provider "can only ever request LESS gating than it gets"
([capability.rs](https://github.com/nearai/ironclaw/blob/main/crates/contracts/ironclaw_host_api/src/capability.rs)).

The built-in IronClaw policy puts ask gates on writes, deletes, network, secrets, approval changes,
budget changes, external writes, and financial effects. It refuses a model-supplied `confirmed=true`
because "a prompt-injected or confused model could supply it"
([builtin_capability_policy.toml](https://github.com/nearai/ironclaw/blob/main/crates/app/ironclaw_composition/src/builtin_capability_policy.toml)).

The [2.1 research of IronClaw](../2.1-notes/nanoclaw-ironclaw-zeroclaw.md), at v1.4.1 and commit
b0b999d, found the same pipeline. The gate checks 4 things in order:

1. a one-shot lease
2. an always-ask set of `Financial`, `ModifyApproval`, and `ModifyBudget`, which holds even under
   yolo mode
3. the tool's own setting
4. a global auto-approve, which is on by default

That research found that the IronClaw `AuditEnvelope` carries no rule ID
([IronClaw](https://github.com/nearai/ironclaw)).

Effects cannot come from the tools themselves. The MCP spec at revision 2026-07-28 says "clients
**MUST** consider tool annotations to be untrusted unless they come from trusted servers"
([MCP Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
Codex nonetheless always asks before a tool call that advertises a destructive annotation
([Codex approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)).

## Information flow and taint

Only approaches that track where data came from guarantee that untrusted content cannot reach out.
Taint tracking makes the "no route out" principle deterministic.

### CaMeL and FIDES

In CaMeL, a privileged LLM writes code from the trusted query, and a quarantined LLM with no tools
parses untrusted data. An interpreter attaches provenance and readers to every value, so untrusted
data "can never impact the program flow"
([CaMeL, arXiv 2503.18813](https://arxiv.org/abs/2503.18813)).

FIDES keeps a context label that joins everything the planner has seen, and it applies 2 universal
policies:

- A consequential call must be decided only from trusted inputs.
- The recipients of an egress call must be allowed to read the data.

Enforcement cut AgentDojo injections from 156 to 0-1
([FIDES, arXiv v2](https://arxiv.org/html/2505.23643v2)).

### Rule of Two and the lethal trifecta

Meta's Rule of Two, published on 2025-10-31, states the same idea at session level. An agent may
hold at most 2 of 3 properties: untrusted input, access to sensitive data, and the ability to change
state or communicate externally. An agent with all 3 needs human approval
([Meta AI blog](https://ai.meta.com/blog/practical-ai-agent-security/)). Simon Willison's lethal
trifecta, published on 2025-06-16, names the same 3 ingredients, and Willison calls 95% detection "a
failing grade" ([simonwillison.net](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)). In
October 2025, adaptive attacks beat 12 published defenses at rates above 90%, which favors
structural controls over detectors
([simonwillison.net](https://simonwillison.net/2025/Nov/2/new-prompt-injection-papers/)).

### Progent

Progent sits between rules and taint. Its policies are allow and forbid rules over a tool name and
its arguments, enforced deterministically. Z3 checks each policy update: narrowing applies
automatically, and widening needs approval. Progent cut attack success from 39.9% to 1.0% at about
98% utility ([Progent, arXiv v3](https://arxiv.org/html/2504.11703v3)).

### Detectors and reference code

The other approaches are probabilistic. MELON, Claude Code auto mode, and the Chrome alignment
critic are detectors or classifiers, not flow guarantees ([MELON](https://arxiv.org/abs/2502.05174);
[Claude blog](https://claude.com/blog/auto-mode-default-in-claude-code);
[Google blog](https://blog.google/security/architecting-security-for-agentic/)).

All IFC reference code is Python: CaMeL, FIDES, fides-gateway, and Progent. CaMeL is an unmaintained
research artifact whose README warns it "might not be fully secure"
([CaMeL repo](https://github.com/google-research/camel-prompt-injection);
[Progent repo](https://github.com/sunblaze-ucb/progent)). FIDES is the only one in production, and
only behind opt-in flags in Copilot CLI and Microsoft Agent Framework
([Microsoft blog, 2026-06-16](https://commandline.microsoft.com/information-flow-control-moving-toward-secure-autonomous-agents/)).

## Capability systems

Capability libraries serve plugin isolation and credential attenuation, not policy. Secure
ECMAScript (SES) Compartments isolate plugin code, and Biscuit attenuates delegated tokens with a
Datalog authorizer. Both lack information-flow tracking, and nobody has tested either in Bun
([Endo](https://github.com/endojs/endo);
[biscuit-wasm](https://github.com/eclipse-biscuit/biscuit-wasm)).

## Recommended mix

The report recommends a policy decision point built from 3 deterministic layers, each producing a
rule ID for the record.

### Cedar rule layer

Run Cedar in-process through `@cedar-policy/cedar-wasm`
([npm](https://registry.npmjs.org/@cedar-policy/cedar-wasm/latest)). Store policies as a map from
owner-visible rule name to policy text, never as one concatenated file, so decisions carry real
names ([Cedar syntax docs](https://docs.cedarpolicy.com/policies/syntax-policy.html)). Run
`validate` against a schema generated from the tool registry before saving any edit. Treat a deny
with an empty `reason` as "no rule matched, ask the owner".

Encode the risk stance per context in Cedar `context`: the task's origin, its taint label, and the
tool's declared effects. AgentCore uses the same shape, with principal, action = tool, and context =
arguments
([AWS What's New](https://aws.amazon.com/about-aws/whats-new/2026/03/policy-amazon-bedrock-agentcore-generally-available/)).

### Effect layer

Declare an effect enum in nixie's own tool registry, modelled on IronClaw. The enum needs
deny-by-default origins and an always-ask set of `Financial`, `ModifyApproval`, and `ModifyBudget`
that no rule can make ungated
([capability.rs](https://github.com/nearai/ironclaw/blob/main/crates/contracts/ironclaw_host_api/src/capability.rs);
[IronClaw](https://github.com/nearai/ironclaw)). Never trust MCP annotations as effects
([MCP Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

### Taint layer

Port a FIDES-style taint label with integrity, readers, and sources. Join the label on every tool
result and check it at each sink. A task that starts by reading untrusted email starts with
untrusted integrity, which applies the Rule of Two ([FIDES](https://arxiv.org/html/2505.23643v2);
[Meta](https://ai.meta.com/blog/practical-ai-agent-security/)). The notes estimate the port at a few
hundred lines of TypeScript.

## Principle check

The mix meets most of nixie's principles and falls furthest short on owner friction.

| Principle                                                         | Verdict                                           |
| ----------------------------------------------------------------- | ------------------------------------------------- |
| Policy is deterministic and lives outside the agent runtime       | Satisfied, with one boundary                      |
| Behaviour is data: owner-editable, versioned, tied to each record | Mostly satisfied                                  |
| Risk stance is set per context                                    | Satisfied                                         |
| Untrusted content cannot reach out alone                          | Satisfied at the tool boundary, short of complete |
| Nothing is hidden: every decision is recorded with its rule       | Partly satisfied                                  |
| Zero-friction UX for the owner                                    | Least satisfied                                   |

- **Deterministic policy:** Cedar, the effect gate, and the taint join are all deterministic code at
  the tool boundary. The labels are deterministic, but what a quarantined LLM extracts from
  untrusted content is not ([FIDES](https://arxiv.org/html/2505.23643v2)). A label may read
  "untrusted", yet the value under it came from a model. LLM reviewers such as auto mode and Codex
  auto-review cannot sit in the decision point.
- **Behaviour as data:** Cedar policies are text keyed by ID, validated before save, and can be
  versioned and cited per decision
  ([Cedar docs](https://docs.cedarpolicy.com/auth/authorization.html)). The mix falls short on
  effect declarations. If the declarations live in the tool registry as code, the owner cannot edit
  them. They must be data, like the IronClaw TOML gate file
  ([builtin_capability_policy.toml](https://github.com/nearai/ironclaw/blob/main/crates/app/ironclaw_composition/src/builtin_capability_policy.toml)).
  The always-ask set is the exception: no edit should lift it.
- **Risk stance per context:** origin and taint label go into Cedar `context`, and the gate matrix
  is keyed by origin, as in IronClaw
  ([capability.rs](https://github.com/nearai/ironclaw/blob/main/crates/contracts/ironclaw_host_api/src/capability.rs)).
  An owner chat starts trusted. A task reading email starts untrusted.
- **No route out for untrusted content:** the taint rule closes egress, write, and financial sinks
  for tainted tasks ([Meta](https://ai.meta.com/blog/practical-ai-agent-security/)). Side channels
  remain: conditional calls, exceptions, and rendered links or images
  ([CaMeL, arXiv v2](https://arxiv.org/html/2503.18813v2)). Catching a mislabeled tool takes a
  network allowlist below the model. The IronClaw local-dev profile runs `DirectLogged` with no
  network broker, which shows how a weak default undoes this principle
  ([IronClaw](https://github.com/nearai/ironclaw)).
- **Nothing hidden:** Cedar explains only Cedar decisions
  ([Cedar docs](https://docs.cedarpolicy.com/auth/authorization.html)). The effect gate and the
  taint rule need their own stable rule IDs, written into the same record. The IronClaw audit
  envelope lacks a rule ID, which is the gap to avoid
  ([IronClaw](https://github.com/nearai/ironclaw)).
- **Zero-friction UX:** the deterministic levers are risk tiers, plan-then-execute for untrusted
  tasks, batching, and confirmed rule suggestions. CaMeL-style taint fired on 10-30% of benign tasks
  ([CaMeL](https://arxiv.org/html/2503.18813v2)). Progent's 6% approval rate is the better benchmark
  ([Progent](https://arxiv.org/html/2504.11703v3)). Digest approvals and confirm-later learned rules
  have little or no precedent. [Approvals](approvals.md#low-friction-options) covers these levers.

## Costs of the mix

The mix depends on pieces with thin support. Cedar is the clear engine choice, but its Bun support
rests on local runs. The widening check that would let nixie auto-apply narrowing rule edits lives
in Cedar's Lean tooling, which the notes did not verify in-process. The taint layer has no library
to adopt. nixie would own a port of research code whose original authors call it a research artifact
([CaMeL repo](https://github.com/google-research/camel-prompt-injection)).

## What nixie borrows

- Cedar in-process, with policies stored as a map from owner-visible rule name to policy text
- schema validation of every policy edit, against a schema generated from the tool registry, as
  cedar-for-agents generates schemas from MCP tool descriptions
- a deny with an empty `reason` as the trigger for asking the owner
- an IronClaw-style effect enum declared by nixie's registry, with deny-by-default origins and an
  always-ask set for `Financial`, `ModifyApproval`, and `ModifyBudget`
- the IronClaw refusal of a model-supplied `confirmed=true`
- a FIDES-style taint label joined on every tool result, applying the Rule of Two per session
- the Progent policy-update check: narrowing applies automatically, and widening needs approval
- stable rule IDs for the effect gate and the taint rule, in the same record as Cedar's

## What nixie avoids

- MCP tool annotations as a source of effects
- LLM reviewers and detectors in the decision point
- `@id` annotations or one concatenated policy file as the source of rule IDs
- OPA's build-time WASM step, the deprecated Oso library, and ReBAC servers
- an audit envelope with no rule ID
- a default profile with no network broker, such as IronClaw's `DirectLogged`

## Open questions

- Can Cedar's policy analysis, or a Progent-style check with a satisfiability modulo theories (SMT)
  solver, run in-process in Bun? The answer decides whether nixie can check learned rules for
  widening automatically.
- Which output types from a quarantined LLM are narrow enough to carry a more permissive label, as
  FIDES does with bools and enums ([FIDES](https://arxiv.org/html/2505.23643v2))?
- What are the tool annotation field names in MCP 2026-07-28? The notes did not verify them.
- Does IronClaw let any grant ungate `Financial`? The notes did not verify it.
