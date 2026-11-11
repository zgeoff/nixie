// Harnesses: how a deployment, the agent and you use each part. Not compiled. No package imports
// this file. Shapes: 02-types.ts. Flows: 03-flow.ts.

// ---- A. A profile on the Codex harness, and a task on it ----

// The deployment's models config:
//
//   profiles:
//     gpt-task:
//       harness: codex
//       base_url: https://<model_api_host>
//       credential: deployment:<name>
//       model: <model_id>
//       effort: <codex_effort>
//       prices: { input: 0, cache_write: 0, cache_write_1h: 0, cached_input: 0, output: 0 }
//   selectable:
//     - name: gpt-task
//       profile: gpt-task
//       description: <what the agent reads when it picks a model>
//
// <codex_effort>: one of the effort values of the pinned Codex CLI. (open: codex effort values)
// The prices are the provider's own; the zeros are placeholders.

// The agent starts a task on it as on any selectable model.
task.start({ model: 'gpt-task' /* and the keys of any other start */ });

// ---- B. A profile outside Claude on the Agent SDK harness, and a task on it ----

//   profiles:
//     openrouter-task:
//       harness: agent-sdk
//       # every key an agent-sdk profile takes, and:
//       outside_claude: true
//       provider_pin: <provider_name>
//
// The counting proxy's config holds no key for this.

task.start({ model: 'openrouter-task' /* and the keys of any other start */ });

// ---- C. A harness definition, and how host code reads a harness ----

// One file per harness in the models module. (open: defineHarness signature)
export const codexHarness = defineHarness({
  id: 'codex',
  profileSchema: codexProfileSchema, // strict
  bind: (profile: CodexProfile): Harness => ({/* the values of 02-types.ts, section G */}),
});

// Host code binds a profile once and reads the record. It never branches on a harness ID.
const harness = bindHarness(profile);
const secret = deriveModelSecret(resolved, harness);
const grant = harness.buildGrant(secret);

const frame = encodeHostFrame(harness.capabilities, {
  type: 'turn',
  profile: harness.toTurnProfile('kept'),
  limits: { modelCalls, toolCallWaitMs: harness.toolCallWaitMs },
  // tools, systemPrompt, input; `resume` only when harness.session is non-null
});

// ---- D. The turn-input log: your commands ----

//   nixie turn-input on            log until `off`; with --for, a set time up to max_window
//   nixie turn-input list          envelope fields and misses; not an opening
//   nixie turn-input open          records the opening, then returns one request's body
//   nixie turn-input off           stop logging; with --drop, also remove every logged request
//
// The arguments that pick a request for `list` and `open` are not agreed. (open: turnInputs
// procedures)

// ---- E. The turn-input log: config ----

// nixie's config. An absent section means the log is off.
//
//   turn_input_log:
//     default: off                  # off | always
//     max_window: 24h
//     close_wait: 5s
//     roles: [conversation, task]
//     retention:
//       days: 7                     # 3 | 7 | 30
//       bytes: 2147483648
//     on_forget: threads            # threads | since_item | keep
//     sources:
//       proxy:
//         base_url: <counting_proxy_url>
//         dir: <spool_folder>
//
// The counting proxy's config. An absent key means the proxy removes a tag and writes no file.
//
//   capture:
//     spool: <spool_folder>
//     max_bytes: 536870912

// ---- F. What a tagged base URL looks like ----

// The profile's base URL:     https://<counting_proxy_host>/<route>
// The turn frame's base URL:  https://<counting_proxy_host>/<route>/~in.<base64url>
// The CLI's request:          POST https://<counting_proxy_host>/<route>/~in.<base64url>/v1/messages
// What the proxy matches:     /<route>/v1/messages
