// Sandboxes: how a caller uses each shape. Not compiled. No package imports this file.
// Types: 02-types.ts. Flows: 03-flow.ts. The sketches hold the shapes and the exact texts. The
// docs hold the rules.

// ---- A. A reader takes its limits from the sizes ----

// The server builds the sizes once, where it loads its inputs, and passes them down beside
// `images`.
const sizes = buildSandboxSizes({}); // a size is a constant, so the overrides are empty

// The conversation and each system task: the row that the harness record names.
const conversationLimits = getHarnessSize(sizes, harness, 'conversation');
const systemTaskLimits = getHarnessSize(sizes, harness, 'systemTask');

// The fetch tool: the web fetch defaults take the row as `sandboxLimits`.
const fetchLimits = sizes.fetch;

// Which sandboxes take which row:
//   conversation   the conversation
//   systemTask     the checker and each started task
//   fetch          each web fetch and each skill fetch

// ---- B. The server applies the watcher once ----

// In the server's `sandbox_adapter` part, around the adapter that the part built: the server's
// own createSandboxAdapter, or the one passed in as the `createSandboxAdapter` option.
const adapter = watchMemoryKills(built, { log });

// → one log line: {"event":"sandbox.memory_watch", …}

// A test of the test sandbox makes a kill show:
await writeMemoryKills(sandbox, 1);

// The guest program that ends next on that sandbox gives one line:
// {"event":"sandbox.memory_kill","ended":"turn","kind":"conversation","memoryMiB":512,
//  "sandboxID":"…","kills":1, …}

// ---- C. The day's check of memory kills ----

// A read-only read of a deployment's log, over the day after the release. The day starts before
// the release's nixie starts, so the log holds its start. `<print_log>` is the deployment's
// command that prints nixie's log for that day. It reads the log and sends nixie nothing.
//
//   <print_log> | grep -c '"event":"sandbox.memory_watch"'
//   <print_log> | grep -c '"event":"sandbox.memory_kill"'
//   <print_log> | grep -c '"event":"sandbox.memory_kill_unknown"'
//
// Expect: 1 or more from the first command, and 0 from the second. Read and explain each line
// that the third command counts.

// ---- D. The memory probes ----

// Each runs on a test imp. `<model_key_secret>` is the runtime secret that holds a test model
// key. `<model_id>` is the model that the turn or the check runs on.

// The bundled conversation image. `<bundled_conversation_image>` is the runtime's name for the
// image that the pull request built.
//
//   MODEL_SECRET=<model_key_secret> bash research/sandbox-memory/probe.sh \
//     <bundled_conversation_image> 384 1 check.sh <model_id>
//
// Expect: `check status=0`, an `{"kind":"answer",…}` reply, `oom_kill 0`, and a `bun` process
// whose peak resident memory is under 50 MiB.

// The Codex row. `<codex_image>` is the runtime's name for the image that the pull request
// built. The secret holds a test model key for the Codex harness's model API.
//
//   MODEL_SECRET=<model_key_secret> bash research/sandbox-memory/probe.sh \
//     <codex_image> 384 1 codex-task.sh <model_id>
//
// Expect: the turn's status is 0, and the output holds `oom_kill 0`.
// `codex-task.sh` is a guest script that the same pull request adds beside the spike's other
// guest scripts. It runs one task turn through the Codex guest under `measure.sh`, and prints the
// guest's `memory.events` lines as `check.sh` does. `check.sh` itself does not fit: it runs the
// conversation guest's check entry, and the Codex harness has no check entry.

// ---- E. The guest's build script ----

// The conversation image's Dockerfile and the bundle's test call the same script:
//
//   bun guests/conversation/build.ts --out <out_dir> --cli-path <cli_path>
//
// `<out_dir>` is where the 2 bundles go. `<cli_path>` is the CLI's path where the bundle runs.
// The Dockerfile passes /app/claude, and it is the one file that names that path.
// The script builds both entries, `main` and `check`, with `--target bun` and with no minifying.

// The host starts an entry of the image's guest:
buildGuestCommand(/* the harness record's guest and entry */);

// → argv: ["bun", "/app/conversation/main.js"]

// The step of the Images workflow on the built conversation image:
//   /app/claude --version        expect exit 0
//   the step fails when the image holds /app/node_modules

// ---- F. The sandbox manifest command ----

//   nixie sandbox-manifest
// → every image of the manifest. The command reads no config.
// {
//   "conversation": { "name": "nixie-conversation-0f3a9c21d4e7", "ref": "…" },
//   "fetch": { "name": "nixie-fetch-7b1e02c955aa", "ref": "…" }
// }

//   nixie sandbox-manifest --needed --config <config_path>
// → the same shape, with only the images that the server adds under that config.
// When the manifest lacks a needed image: a non-zero exit and the refusal of 02-types.ts,
// section F. `--needed` has a default of false. `--config` is read as `nixie health` reads it.

// The release.json builder takes the manifest's path:
//   --sandbox-manifest <path>

// ---- G. A part names its images ----

const workerPart = {
  // Returns the key only when the config sets the role that the part serves.
  images: (config: DeploymentConfig) => (hasWorkerRole(config) ? ['worker'] : []),
};

// A test calls each function with a tuple of its own:
const testKeys = ['conversation', 'fetch', 'extra'] as const;

const held = await loadSandboxManifest(testKeys, path); // a manifest file with 2 of the 3 keys

pickNeededImages(testKeys, held, [
  { key: 'conversation', neededBy: 'the conversation' },
  { key: 'fetch', neededBy: 'the web fetch tool' },
]);

// → the 2 images

// ---- H. A deployment orders its own step before the component's resources ----

// The form when Pulumi passes the component's dependsOn to its children.
// (open: dependsOn check)
createNixie('nixie', args, { dependsOn: [addSandboxImages] });
// A caller with no such step passes nothing:
createNixie('nixie', args);
