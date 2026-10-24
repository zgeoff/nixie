# Spike: skills and slash commands under nixie's SDK options

This spike runs the Claude Agent SDK under the options of nixie's model loops and checks which
skills and slash commands reach the model. Its finding sets the skill options in decision
[0038](../../docs/decisions/0038-skills.md).

## Question

With every built-in tool off, no settings sources and `skills: []`, can a skill planted in the
user's or the project's skill folder reach the model, does a prompt that starts with `/` run a skill
or a command, and which options close the routes that stay open?

## Answer

- Neither planted skill reaches the model: `settingSources: []` keeps both out.
- The CLI's 17 bundled skills and 28 built-in commands stay listed, with or without `skills: []`.
- A prompt of `/deep-research` puts that bundled skill's body in front of the model, and `/clear`
  runs as a local command with no model turn.
- `verbatimPrompts: true` stops the dispatch, and the `disableBundledSkills` setting removes the
  bundled skills, leaving the 2 from built-in plugins.

Set `verbatimPrompts: true` and `disableBundledSkills` on every model loop.

## Run it

```bash
bun install
CLAUDE_CODE_OAUTH_TOKEN=$(op --cache=false read 'op://nixie/claude-code-oauth-token/credential') bun run spike
```

The [setup](results.md#setup) gives the versions and the 3 configurations.

## Results

The [results](results.md) hold the `init` output, the table of prompts by configuration, and the
answer to each question.

## Untested

Messages streamed into a running session, and a session inside an imp. The
[untested list](results.md#untested) gives the rest.
