# 0038: Skills

- Date: 2026-10-11
- Status: decided
- Design: [skills](../design/platform/skills.md)
- Research: [Agent Skills specification](https://agentskills.io/specification),
  [Agent SDK skills](https://code.claude.com/docs/en/agent-sdk/skills),
  [skill distribution](https://blog.trailofbits.com/2026/06/03/the-sorry-state-of-skill-distribution/)

A skill is a folder in the Agent Skills format: instructions, reference files and scripts. A skill
is a procedure, and it grants nothing: no tool, no effect, no destination permission and no
credential grant. nixie ignores the format's `allowed-tools` field. nixie's skills settle these
choices:

- **Skills are definitions.** They live in the definitions repo and reach nixie through the
  definitions source from [0020](0020-deployment.md). nixie never installs a skill from a registry
  at runtime.
- **Third-party skills are vendored** into the definitions repo, with a lock entry that pins the
  upstream commit and the content hash.
- **A task keeps the skill versions it started with,** as it keeps its persona and job under
  [0013](0013-definition-versioning.md). `skill_reload` and `skill_reload_all` move a running task
  to the current versions, and a rule on either tool gates it.
- **Each caller has a skill list,** as it has a tool list: the job's list, the conversation's list,
  or a worker's subset.
- **Trust rests on the pin and your review.** nixie checks a publisher's signature when one exists
  and never requires one. Checks in code refuse a malformed skill, and no scan lets a skill in.
- **nixie-written skills are proposals,** unless an allow rule of yours that names `skill_write`
  applies them at once with a notice and undo. A skill holding a destination you never typed stays a
  proposal whatever the rule says.
- **nixie's own tools deliver skills.** The SDK loads none. A catalog of names and descriptions sits
  in the system prompt, and `skill_read` loads a skill's body or files into the record.
- **Scripts run only through the code tool** from [0022](0022-coding-and-code-execution.md), with
  the skill's folder read-only in the code run's sandbox.

## Why

- A skill that grants nothing can only steer the model, and policy stops a steered model whatever
  steered it. Scanning cannot carry that load: one study got past every skill scanner it tried
  ([Trail of Bits](https://blog.trailofbits.com/2026/06/03/the-sorry-state-of-skill-distribution/)).
- Registries have carried malware, with hundreds of malicious skills in one during 2026
  ([Unit 42](https://unit42.paloaltonetworks.com/openclaw-ai-supply-chain-risk/)). Vendoring gives a
  third-party skill the same review and pin as your own definitions.
- The format is shared across assistants, so a published skill loads unchanged
  ([specification](https://agentskills.io/specification)).
- The SDK discovers skills only from the filesystem
  ([SDK skills](https://code.claude.com/docs/en/agent-sdk/skills)). nixie's own catalog and tool
  work with any runtime adapter and record every load.
- A procedure that changes partway through a task confuses you and the record, and a reload changes
  it at a recorded point.
- Your rule sets how much review nixie-written skills get, as your risk stance does elsewhere.

## Alternatives

- **Instructions only, with no scripts.** It is simpler, and drops the published skills that depend
  on bundled scripts.
- **Install from a registry at runtime.** It skips both your review and the pin.
- **Skills that apply at once, like rules.** A fix arrives sooner, and a task's procedure changes
  without anyone asking.
- **Require signatures, or gate on a scan.** Few publishers sign, a signature proves who published a
  skill and not that it is safe, and the published bypasses show a clean scan guarantees nothing.
- **The SDK's Skill tool through a local plugin.** It ties skills to one runtime and leaves each
  load out of the record.
- **Each script as its own tool.** A script gets a typed effect, and a skill then adds tools.

## Consequences

- The definitions format version rises, because the filter admits scripts under `skills/`.
- The snapshot hash covers every skill.
- A spike checks what the SDK's `init` message lists for skills and commands under nixie's options.
- A script uses only what the code image holds, because a code run has no network.
