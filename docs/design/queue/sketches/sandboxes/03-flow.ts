// Sandboxes: each flow as commented code. Not compiled. No package imports this file.
// Shapes: 02-types.ts. Where a doc and a sketch differ, the sketch wins for shapes and the doc
// wins for rules. The helper names here are this sketch's own.

// ---- A. A sandbox whose size differs from its stored spec ----

// Built: nixie reuses a sandbox only when its stored spec equals the spec it wants. A size is
// part of the spec, so the first start of a release with other sizes does this once per sandbox.
async function reuseOrReplace(found, wanted) {
  if (isSameSpec(found.spec, wanted)) return found;

  if (wanted.kind === 'conversation') {
    const next = await adapter.create(wanted);

    await copySession(found, next); // the session moves into the sandbox that replaces it

    await found.destroy();

    return next;
  }

  // A started task: its next step destroys the sandbox with no copy. The guest opens a session
  // from the log.
  await found.destroy();

  return adapter.create(wanted);
}

// A fetch creates its own sandbox for each call, so nothing is replaced.

// ---- B. The watcher, for one spawned guest program ----

// State, in memory only: the last count seen for each sandbox, and the pending read for each
// sandbox. Both are keyed by the sandbox's ID, because `read` and `list` on an adapter hand out
// another object for the same sandbox.
const lastCount = new Map<string, number>();
const pendingRead = new Map<string, Promise<void>>();

function watchCreate(sandbox) {
  lastCount.set(sandbox.id, 0); // a sandbox that the watcher created starts at 0

  return wrap(sandbox);
}

async function watchFound(sandbox) {
  // A sandbox that the watcher found, after a restart of nixie, is read once before its first
  // spawn. A count above 0 gives a no_baseline line.
  // (open: baseline line): that line needs `ended`, and no guest program has ended here.
  const first = await readWithLimit(sandbox);

  if (first.kind === 'count') lastCount.set(sandbox.id, first.kills);

  return wrap(sandbox);
}

function wrap(sandbox) {
  return {
    ...sandbox,
    spawn: async (command) => {
      await pendingRead.get(sandbox.id); // the next spawn of any object with this ID waits

      const stream = await sandbox.spawn(command);

      // 1. The program ends in any way. `exit` and `stop()` settle as the adapter gave them.
      //    The watcher never reads the exit's code or signal.
      void stream.exit.then(() => startRead(sandbox));

      return stream;
    },
    destroy: async () => {
      await pendingRead.get(sandbox.id); // the read comes before nixie destroys the guest

      return sandbox.destroy();
    },
    suspension: wrapSleep(sandbox), // suspension.sleep waits for the pending read too
    // exec is passed through. A guest program started through exec is not watched.
  };
}

function startRead(sandbox) {
  // 2. The read starts when the program ends, with its own limit (readTimeoutMs).
  //    A fetch's reply does not wait for it: the read sits where the fetch's destroy is.
  const read = readWithLimit(sandbox).then((result) => judge(sandbox, result));

  pendingRead.set(sandbox.id, read);
}

// 3. The compare and the update of the last count happen with no await between them. 2 guest
//    programs that end together on one sandbox give one line for one kill.
function judge(sandbox, result) {
  const base = {
    ended: toEnded(sandbox.spec.kind),
    kind: sandbox.spec.kind,
    memoryMiB: sandbox.spec.limits.memoryMiB,
    sandboxID: sandbox.id,
  };

  // (open: unsupported lines): one warn line after every guest program on such an adapter.
  if (result.kind === 'unsupported') return warn({ ...base, reason: 'unsupported' });

  if (result.kind === 'failed') return warn({ ...base, reason: 'read_failed' });

  const last = lastCount.get(sandbox.id);

  lastCount.set(sandbox.id, result.kills);

  if (last === undefined) {
    if (result.kills > 0) warn({ ...base, reason: 'no_baseline' });

    return;
  }

  if (result.kills < last) return warn({ ...base, reason: 'counter_reset' });

  if (result.kills > last) return error({ ...base, kills: result.kills }); // (open: kills field)
  // The same count: no line.
}

// 4. The watcher writes at most one line for one end. A failed or slow read never changes an
//    exit.

// readWithLimit: sandbox.readMemoryKills(signal), with a signal that aborts at readTimeoutMs.
// A read that passes the limit counts as `failed`.

// The imp adapter's readMemoryKills: one command in the guest that prints its memory.events
// file, through the adapter's own exec.
//   an `oom_kill <n>` line      → { kind: "count", kills: n }
//   no file, or no such line    → { kind: "unsupported" }
//   the exec rejects            → { kind: "failed" }
// The path and the parser are in the imp adapter. The ImpPort interface holds no method for it.

// ---- C. The images at start ----

async function loadImagesAtStart() {
  // 1. nixie loads the config and the manifest. Each refuses on its own schema.
  const config = await loadDeploymentConfig();
  const images = await loadSandboxManifest(sandboxImageKeys, '/app/sandbox-manifest.json');

  // 2. One need per configured profile, then one per key that a part's images(config) returns.
  const needs = listImageNeeds(config);

  // 3. Throws the refusal when checkImageFit finds one missing, before any part starts.
  //    Nothing retries it.
  const needed = pickNeededImages(sandboxImageKeys, images, needs);

  // 4. `needed` holds the needed images only. The add, toImageNames and the adapter's add
  //    before a create all read it.
  return needed;
}

// 5. The `add_images` part (registerSandboxImages, built) adds them one after another, and
//    writes an `image.added` log line for each. The state `images` goes from not ready to ready
//    after the last needed image. Readiness waits for no other image.

// ---- D. A release publishes and pins each image ----

// 1. Each image has its own job in the release workflow, named by its key. The job pushes by
//    digest and gives its `ref`.
// 2. The `sandbox-manifest` job reads every image job's `ref` (open: needs refs) and calls
//    buildSandboxManifest(refs). It refuses, by name, a key of the tuple with no ref and a ref
//    with no key. A workflow that lacks a key's job fails here, before the nixie image builds.
// 3. Every stage after it reads that job's one output: the nixie image build, the notes, the
//    pull check with no credentials, the tags, and release.json, whose builder takes
//    --sandbox-manifest <path>.
// 4. The release tags last. No commit holds a digest.

// ---- E. The guest bundle, from build to start ----

// 1. The Dockerfile runs the build script with --out and --cli-path /app/claude.
// 2. The script builds `main` and `check` with --target bun and with no minifying, and sets the
//    build-time constant to the CLI's path.
// 3. The image holds the 2 bundles and the CLI, at the paths of 02-types.ts, section G.
// 4. The host starts `bun /app/<package>/<entry>.js` (buildGuestCommand).
// 5. The bundle passes the constant to the SDK as pathToClaudeCodeExecutable, and the SDK starts
//    the CLI at /app/claude.
//
// On the test sandbox, step 4 starts the guest from the workspace's source. The guest has no
// constant, and the SDK finds its CLI by its own lookup.

// ---- F. A deployment adds the images before a roll ----

// A deployment's own step, outside this repo:
// 1. It runs `nixie sandbox-manifest` on the nixie image of the release it is about to roll to.
// 2. It adds each entry to the runtime under its `name`, from its `ref`.
// 3. It passes --needed only when that release's command has the flag.
//
// What each form of script does with a third image:
//   walks the entries            adds it, and pins it from release.json. It also pulls an
//                                image that the config does not use, once for each release that
//                                changes that image's digest.
//   reads `conversation` and     skips it. nixie adds a needed third image itself at start when
//   `fetch` by name              its token may add images. Otherwise `images` is not ready and
//                                names the image.
//   refuses a key it does        stops before the roll, with its own reason.
//   not know
