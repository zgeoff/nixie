# Spike: skills and slash commands under nixie's SDK options

This spike runs the Claude Agent SDK with every built-in tool off and no settings sources, and
plants a skill in the user's and the project's skill folders. Neither planted skill reaches the
model. The CLI's bundled skills do: with `tools: []`, `settingSources: []` and `skills: []`, a
prompt of `/deep-research` puts that bundled skill's body in front of the model, and `/clear` runs
as a local command with no model turn. `verbatimPrompts: true` with the `disableBundledSkills`
setting closes both routes.

## Questions

1. Which skills and slash commands does `init` list under nixie's options?
2. Does a skill in `~/.claude/skills/` or `<cwd>/.claude/skills/` reach the model?
3. Does a prompt that starts with `/` run a skill or a command?
4. Does `skills: []` change the answers?
5. Which options close the routes that stay open?

## Versions

| Component        | Version                     |
| ---------------- | --------------------------- |
| Claude Agent SDK | 0.3.293                     |
| Claude Code      | 2.1.293                     |
| Bun              | 1.4.2                       |
| Model            | `claude-haiku-4-5-20251001` |

## Setup

[`run.ts`](run.ts) makes a temporary directory with an empty `home` and a `work` directory. It
plants `planted-home` in `home/.claude/skills/` and `planted-project` in `work/.claude/skills/`,
each told to reply with a marker word. Every session runs on the host with `HOME` set to the empty
`home`, `cwd` set to `work`, `tools: []`, `settingSources: []`, `strictMcpConfig: true` and
`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`.

3 configurations each send 4 prompts:

- **A:** the options above.
- **B:** A plus `skills: []`.
- **C:** B plus `verbatimPrompts: true` and `settings: { disableBundledSkills: true }`.

The prompts ask the model to list its tools, skills and commands and to quote `planted-home`, then
send `/planted-home`, `/deep-research` and `/clear`. The script reports whether either marker
appears anywhere in a session's messages.

## Run

```bash
bun install
CLAUDE_CODE_OAUTH_TOKEN=$(op --cache=false read 'op://nixie/claude-code-oauth-token/credential') bun run spike
```

## Output

`init` for A and B, trimmed:

```text
init tools=[]
init skills=["deep-research","dataviz","update-config","verify","debug","code-review","simplify","batch","fewer-permission-prompts","doctor","loop","schedule","claude-api","workflow-authoring","run","run-skill-generator","plugin-authoring"]
init plugins=[{"name":"cc-plugin-agents-md","path":"builtin",...},{"name":"cc-plugin-plugin-authoring","path":"builtin",...}]
```

`init.slash_commands` lists the 17 skills plus 28 built-in commands, such as `clear`, `compact`,
`init` and `model`. In C, `init.skills` is `["doctor","plugin-authoring"]`, both from the built-in
plugins.

| Prompt           | A and B                                                                 | C                                    |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| List and quote   | No skill or command named, no marker                                    | No skill or command named, no marker |
| `/planted-home`  | "not available", then a list of the bundled commands                    | Read as plain text                   |
| `/deep-research` | The skill's own steps: "5 parallel search angles", "3-vote adversarial" | A generic request for a topic        |
| `/clear`         | `result success turns=0`, with no model call                            | Read as plain text, 1 turn           |

No session showed either marker.

## Answers

1. `init.skills` lists 17 bundled skills under nixie's options, with or without `skills: []`, and
   `init.slash_commands` adds 28 built-in commands.
2. No. `settingSources: []` keeps both planted skills out, and the model never saw a marker.
3. Yes. The CLI dispatches a prompt that starts with `/`: a bundled skill's body reaches the model,
   and a built-in command such as `/clear` runs before any model call. The model has no Skill tool,
   so only the prompt text can start one.
4. No. `skills: []` hides skills from the model's listing, and neither the listing nor the dispatch
   changed.
5. `verbatimPrompts: true` stops the dispatch: every prompt in C reached the model as written. The
   `disableBundledSkills` setting removes the bundled skills from `init`, leaving the 2 from
   built-in plugins.

## Untested

- Messages streamed into a running session. The SDK documents that `verbatimPrompts` covers
  `streamInput()`, and the spike sent only string prompts.
- A session inside an imp. The options and the CLI are the same in the guest.
- Whether `doctor` or `plugin-authoring` can reach the model by another route, with no Skill tool
  and no dispatch.
