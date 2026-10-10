# 0038: Skills

- Date: 2026-10-11
- Status: decided
- Design: [skills](../design/platform/skills.md)
- Research: [Agent Skills specification](https://agentskills.io/specification),
  [Agent SDK skills](https://code.claude.com/docs/en/agent-sdk/skills),
  [skill distribution](https://blog.trailofbits.com/2026/06/03/the-sorry-state-of-skill-distribution/)

A skill is a folder in the Agent Skills format: a `SKILL.md` file with a name, a description and a
body of instructions, plus reference files and scripts. A skill is a procedure, and it grants
nothing: no tool, no effect, no destination permission and no credential grant. nixie ignores the
format's `allowed-tools` field, and the tool list of the job or the conversation stays the scope
under [0015](0015-taint-scope.md). A bad skill can therefore only steer the model, and policy stops
a steered model whatever steered it.

| Part        | What it is                                             | How policy sees it                                  |
| ----------- | ------------------------------------------------------ | --------------------------------------------------- |
| Tool        | A capability the model calls, with fixed effects       | A decision on every call                            |
| Connector   | nixie's code for one outside service, which adds tools | A decision on each of its tools                     |
| Memory item | A fact about you, with your quote as evidence          | The write checks from [0011](0011-memory-writes.md) |
| Skill       | A procedure: instructions, references and scripts      | A `read` to load it, `run_code` for its scripts     |

## Where skills come from

Skills are definitions. They live under `skills/<name>/` in the definitions repo and reach nixie
through the definitions source from [0020](0020-deployment.md), and nixie never installs a skill
from a registry at runtime. Under `skills/`, the definitions filter admits UTF-8 text files of any
extension, so scripts come with their skill, and binary files stay out.

A third-party skill is vendored: copied into `skills/<name>/`, with an entry in `skills.lock.json`
that holds its upstream URL, the full commit SHA, its path and its content hash. The seed refuses a
snapshot in which a vendored skill's files differ from its lock entry.

## Versions and reload

A task keeps the skill versions it started with, as it keeps its persona and job under
[0013](0013-definition-versioning.md). 2 tools move a running task on:

- `skill_reload` moves the task to the current version of one named skill.
- `skill_reload_all` moves the task to the whole current skill set on its list, with new skills
  joining the catalog and removed skills leaving it.

Both tools take a fresh snapshot from the definitions source first, declare the `note` effect, and
record the old and new hash of each skill. A rule on either tool name gates it. A reload never pulls
a newer upstream version of a vendored skill. A new or changed skill from the seed applies with a
notice and asks for no confirmation, because a skill widens nothing.

## Which tasks see which skills

Each caller has a skill list, as it has a tool list. A job lists its skills in a `skills` field. The
conversation has a `skills` list in the definitions, which holds every skill when it is not set. A
worker gets the subset its caller passes. A rule can deny a skill by name in a context. A skill off
the caller's list stays out of its catalog, and every skill tool refuses it.

## Trust

- **Pinned.** The snapshot's content hash, the lock's commit SHA and the per-task pin fix every byte
  a task reads.
- **Signed when the publisher signs.** The format defines no signature. The vendor command checks a
  publisher's signature when one exists and records the result in the lock, and nixie never requires
  one.
- **Scanned, as advice.** The seed refuses a skill that fails a check in code: invalid frontmatter,
  a name that differs from its folder, a binary file, a file over the size limits, or invisible or
  bidirectional Unicode control characters. The vendor command lists every destination-like token
  and every command that installs a package or reaches the network, for your review. No scan lets a
  skill in.
- **nixie-written skills are proposals by default.** `skill_write` drafts a new skill or a change as
  a proposal that shows every file as a diff. An allow rule of yours that names the `skill_write`
  tool lets a skill apply at once with a notice and undo, in the contexts the rule names. A rule
  that matches the `note` effect alone, such as the starter rule that allows notes, lets the call
  run and keeps the proposal. No starter rule names the tool, and creating such a rule is a
  widening, so it asks once. Whatever the rule says, a skill holding a destination-like token that
  is in neither text you typed nor your definitions stays a proposal. nixie exports an applied skill
  to the definitions repo as a pull request, as it does runtime rules.
- **Provenance on every skill:** your definitions, vendored with its URL and SHA, or written by
  nixie with the approval or rule that applied it.

## How a skill reaches the model

The SDK loads no skill and offers no Skill tool: every model loop sets `tools: []`,
`settingSources: []` and `skills: []`. The stable part of each prompt holds a catalog of the name
and description of every skill on the caller's list. The `skill_read` tool, with the `read` effect,
returns a skill's body or one of its files at the task's pinned version, and records each load with
the skill's hash.

## How a skill's scripts run

A skill's scripts run only through the code tool from [0022](0022-coding-and-code-execution.md). The
code tool takes a list of skills and places each one's whole folder, at the pinned version and
read-only, in the code run's sandbox. The code run keeps the sandbox, the `run_code` effect, the
limits and the outside-content result of any code run. A rule can match the skill argument, such as
asking before a vendored skill's script runs. Coding sessions stay outside this decision, because
each coding adapter owns its harness.

## Why

- The grant-nothing invariant keeps every guarantee in policy, where it holds for any content.
  Scanning cannot carry that load: one study got past every skill scanner it tried and recommends
  pinning and control over who adds skills instead
  ([Trail of Bits](https://blog.trailofbits.com/2026/06/03/the-sorry-state-of-skill-distribution/)).
- Registries have carried malware: hundreds of malicious skills reached one in 2026, and some passed
  its scanning later
  ([Unit 42](https://unit42.paloaltonetworks.com/openclaw-ai-supply-chain-risk/)). Vendoring puts a
  third-party skill under the review and pin you already give your definitions.
- The Agent Skills format is shared across assistants, so a skill written for one loads in nixie
  unchanged ([specification](https://agentskills.io/specification)).
- The SDK discovers skills only from the filesystem, with "no programmatic API for registering them"
  ([SDK skills](https://code.claude.com/docs/en/agent-sdk/skills)). nixie's own catalog and tool
  work with any runtime adapter and put every load in the record.
- A procedure that changes partway through a task confuses you and the record, and an explicit
  reload fixes a skill in a long task at a recorded point.
- Your own rule decides how much review nixie-written skills get, as your risk stance decides
  elsewhere. The token check keeps the worst case, a skill that points future tasks at a new
  destination, in review.

## Alternatives

- **Instructions only, with no scripts.** It is simpler, and it drops the many published skills that
  depend on bundled scripts.
- **Install from a registry at runtime.** It is convenient, and it skips both your review and the
  pin.
- **Skills that apply at once, like rules.** A running task gets a fix sooner, and its procedure can
  change partway through without anyone asking.
- **Require signatures.** Few publishers sign a skill, and a signature proves who published it, not
  that it is safe.
- **Scanning as a gate.** A clean scan reads as a safety guarantee that the published bypasses show
  it is not.
- **nixie-written skills only through a merged pull request.** It keeps one path, and makes you
  leave the client for every small fix.
- **The SDK's Skill tool through a local plugin in the imp.** It gives native loading, ties skills
  to one runtime, and leaves loads out of nixie's record.
- **Every skill body in the prompt.** It needs no tool, and costs tokens on every turn for skills a
  task never uses.
- **Each script as its own tool with declared effects.** A script gets a typed effect, and a skill
  then adds tools, which breaks the invariant.
- **Scripts on the disk of the conversation's imp.** It matches the native layout, and runs a script
  beside the model credential and untrusted content.

## Consequences

- The definitions format version rises with the `skills/` filter, and a release reads that version
  and the one before.
- The snapshot hash covers every skill, and a task records the skill versions it pinned.
- `skill_read` rides on nixie's tool endpoint, so a run whose endpoint is not connected stops
  instead of running without its skills.
- A spike checks what the SDK's `init` message lists for skills and commands under these options.
- Later per-job-run taint under 0015 can treat a vendored skill as untrusted from its provenance,
  with no migration.
- A skill's script depends on what the code image holds, because a code run has no network to
  install a package.
