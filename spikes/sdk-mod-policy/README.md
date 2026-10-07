# Spike: a policy mod in the Agent SDK

This spike loads a Claude Code mod into an Agent SDK `query()` and tests whether the mod can enforce
tool policy there. It also breaks the mod in three ways and looks for the signals a host adapter can
use to tell that the policy is gone.

- SDK: `@anthropic-ai/claude-agent-sdk` 0.3.292, which runs its bundled Claude Code 2.1.292
- Model: `claude-haiku-4-5-20251001`
- Options on every run: `settingSources: []`, `permissionMode: 'default'`,
  `allowedTools: ['Bash', 'Read']` (`['Bash']` in the probe), `permissionPrompts: 'none'`, and an
  `env` that passes only `PATH`, `HOME`, and the OAuth token

## Questions

1. Does a mod load in the SDK, and do `tool.call` and `tool.check` fire for built-in tools? Can
   `tool.call` deny a call, rewrite its arguments, and answer it without running the tool? Does
   `tool.check` override an allow?
2. When the module throws at load, a hook throws, or a hook blocks the hooks worker, does the tool
   call still run? What can the adapter see, and does `.catch` on a registration make a throwing
   hook deny?

## Run it

Run each command from this directory. The token comes from the repo's `.env`.

```bash
bun install
# Question 1: the policy mod against six Bash calls and one Read
env -u ANTHROPIC_API_KEY bun --env-file=../../.env run.ts mods/nixie-policy prompts/policy.txt --debug-file /tmp/policy.log
# Question 2: one run for each broken mod
for m in nixie-throw-load nixie-throw-hook nixie-throw-hook-catch nixie-busy-loop; do
  env -u ANTHROPIC_API_KEY bun --env-file=../../.env run.ts mods/$m prompts/failure.txt --debug-file /tmp/$m.log
done
# Question 2: probe for the mod before and after the worker wedges
env -u ANTHROPIC_API_KEY bun --env-file=../../.env probe.ts mods/nixie-busy-loop
```

`run.ts` prints a timeline of the init message, each tool call and result, and the final result.
Claude Code writes type declarations into `.claude-plugin/types/` and a `tsconfig.json` into each
mod directory every time it loads the mod. `.gitignore` keeps both out of the repo.

## Answers

- A mod loads through `options.plugins`. The SDK starts Claude Code with `--plugin-dir`, and the
  debug log reads `hooks module nixie-policy@inline loaded (worker, environment 1, tier user)`.
- `tool.call` and `tool.check` fire for Bash and for Read.
- `tool.call` can deny a call, rewrite its arguments, and answer it without running the tool. An
  answer must have the tool's own output shape.
- `tool.check` overrides an allow: it denies a call that an `allowedTools` rule allowed.
- A broken policy mod does not stop tool calls. In each of the three failures the tool call runs.
- `.catch` on a registration makes a throwing hook deny. It does not help a hook that wedges the
  worker.

### Question 1: policy outcomes

The `nixie-policy` mod picks an outcome from a marker in each Bash command. Every call in the run
below reaches the mod:

```text
2.6s tool_use Bash {"command":"echo plain MARK_NONE"}
2.9s tool_result "plain MARK_NONE"
4.3s tool_use Bash {"command":"echo blocked MARK_DENY"}
4.3s tool_result (is_error) "<tool_use_error>nixie-policy denied this command.</tool_use_error>"
5.7s tool_use Bash {"command":"echo original MARK_REWRITE"}
5.7s tool_result "rewritten-by-nixie"
7.2s tool_use Bash {"command":"echo original MARK_ANSWER"}
7.2s tool_result "answered-by-nixie"
8.5s tool_use Bash {"command":"echo original MARK_ANSWER_TEXT"}
8.5s tool_result (is_error) "<tool_use_error>tool.call step resolved Bash with a result that does not match its output shape: ..."
10.0s tool_use Bash {"command":"echo checked MARK_CHECK"}
10.0s system permission_denied {"tool_name":"Bash", ...}
10.0s tool_result (is_error) "Permission to use Bash denied by plugin nixie-policy: nixie-policy tool.check denied this command."
11.9s tool_use Read {"file_path":"<repo>/spikes/sdk-mod-policy/prompts/policy.txt"}
```

The debug log has a `Spawning shell` line only for the plain call and the rewritten call. The denied
call and both answered calls never start a shell. A `tool.call` hook that answers or denies keeps
`tool.check` from firing for that call. For the calls that reach it, `tool.check` sees the upstream
decision `{"decision":"allow","rule":"Bash"}`.

An answer must match the tool's output type from
`.claude-plugin/types/claude-code-tools/index.d.ts`. For Bash, that type is
`{ stdout, stderr, interrupted }`. A plain string fails closed: the model reads an `is_error`
result, and the tool does not run. The mods docs list a result of the wrong shape among the failures
that skip a hook, so this case behaves differently from the docs.

A `tool.check` deny reaches the SDK stream as a `permission_denied` system message, which the
adapter can log. A `tool.call` deny reaches the stream only as the tool result.

### Question 2: failures

Each broken mod gets the same three Bash calls: a call that a working policy denies, a call that
triggers the failure, and a second call that a working policy denies.

- The module throws at load:
  - Tool calls: all 3 run.
  - SDK stream: `init.plugins` lists the mod, and `plugin_errors` is empty.
  - Debug log: `[ERROR] nixie-throw-load: hooks module did not load: Error: ...`
- A hook throws, without `.catch`:
  - Tool calls: all 3 run.
  - SDK stream: nothing.
  - Debug log: `[ERROR] nixie-throw-hook: tool.call hook skipped: threw Error: ...`
- A hook throws, with `.catch`:
  - Tool calls: all 3 denied.
  - SDK stream: the `deny` text from the handler, as the tool result.
  - Debug log: `[WARN] hook failed closed: ... (tool.call; its .catch answered)`
- A hook spins without yielding:
  - Tool calls: the call that wedged the worker runs after 6 s, and later calls run with no policy.
  - SDK stream: a `commands_changed` message without the mod's command.
  - Debug log: `hooks worker: no answer to a heartbeat ...`, then
    `nixie-busy-loop was unloaded: it crashed the hooks worker`

The `.catch` handler receives `next.error.kind` and `next.error.message`, so the model reads
`nixie policy failed (throw: nixie-throw-hook-catch: hook failed), so the command did not run.`

A `.catch` handler does not help the busy loop. Claude Code unloads the whole mod, so the handler
goes with it, and the call that wedged the worker runs. The other mods in the worker respawn without
it: `hooks worker: respawning for cc-plugin-agents-md, cc-plugin-telemetry`.

The SDK `stderr` callback receives nothing in any of these runs. The mods troubleshooting page
states that a `claude -p` run writes `hooks module not loaded` to stderr, but only in the text
output format, and the SDK runs Claude Code with `--output-format stream-json`. `plugin_errors`
covers plugin load failures, such as a missing path or a bad manifest, and does not cover a hooks
module that throws.

### Detect a missing policy mod

The `init` message lists a plugin whether or not its hooks module loaded, so `init.plugins` does not
show that the policy is active. A command that the mod registers in `session.start` does show it,
because Claude Code adds the command only after the module runs. `probe.ts` gives the busy-loop mod
a `/nixie-alive` command with `immediate: true` and reads the command list:

```text
0.0s host sends "/nixie-alive"
0.5s init nixie commands=["nixie-alive"]
0.5s result success "nixie-busy-loop: nixie-policy alive"
2.6s tool_use Bash {"command":"echo first MARK_BLOCK"}
8.6s system commands_changed nixie commands=[]
8.8s tool_result "first MARK_BLOCK"
10.1s tool_use Bash {"command":"echo second MARK_DENY"}
10.1s tool_result "second MARK_DENY"
11.3s host sends "/nixie-alive"
11.4s init nixie commands=[]
15.3s result success "The `/nixie-alive` command is not available as a slash command in this agent session. ..."
15.4s reloadPlugins plugins=["nixie-busy-loop", ...]
15.4s system commands_changed nixie commands=["nixie-alive"]
```

This gives the adapter three checks, in order of when they fire:

- At start: stop the session when `init.slash_commands` lacks the mod's command. This catches a
  module that throws at load before the model makes any tool call.
- Mid-session: treat a `commands_changed` message without the command as an unloaded policy, and
  call `interrupt()` or `close()`. The message arrives about 6 s after the hook starts, 0.2 s before
  the wedged call's result, so the adapter learns of the unload only as that call runs.
- On demand: send `/nixie-alive` when `slash_commands` lists it. Claude Code runs a local command
  without a model call. Sent after the unload, the text goes to the model as a plain prompt instead,
  so check the command list first.

`reloadPlugins()` loads the mod again after an unload and restores the command. `getHooksListing()`
returns no events in these runs. Its type describes the listing that the `/hooks` menu shows, which
covers settings, session, and plugin hooks.

## Untested

- An SDK `PreToolUse` callback as a second guard that denies every call while the mod's command is
  missing. The spike shows the signal, not the guard.
- Whether `interrupt()` on the `commands_changed` message stops the call that wedged the worker.
- Whether a mod that the organization installs through `prependPlugins` behaves differently on
  failure. Managed settings are out of scope here.
- The `sec-default` guard. It loads only with managed settings or a Team or Enterprise sign-in, so
  it does not appear in these runs.
