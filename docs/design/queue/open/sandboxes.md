# Sandboxes: what is not settled

Each item is marked in a doc or a sketch as `(open: <name>)`. The docs are
[the sandbox sizes](../sandbox-sizes.md), [the memory-kill signal](../memory-kill-signal.md),
[the sandbox images](../sandbox-images.md), [the sandbox image set](../sandbox-image-set.md) and
[the Kubernetes step order](../kubernetes-step-order.md). The slices are in
[the sandbox slices](../slices/sandboxes.md).

## Items that block a slice

Each item starts with its milestone and the slices that it blocks. An item blocks a slice when the
slice cannot be built or checked until the item is settled. [The open list](../open.md) holds every
blocking item of the queue.

- Slice 3: unsupported lines; count across sleep; kills field; baseline line.
- Slice 4: in part: installed cli path.
- Slice 6: image set issue; size rows order; size refusal text; manifest refusal text; several
  missing images; null size row.
- Slice 8: image session; fetch base issue.
- Slice 9: dependsOn check; in part: ordering argument.

## Not decided

- **unsupported lines.** Milestone 1. Blocks slice 3. An adapter that returns `unsupported` gives a
  warn line after every guest program, for as long as nixie runs. The source does not address this.
  Options: one line for each end, which the docs follow; one line for each sandbox; one line when
  the server applies the watcher. No option is stated as intended.
- **image session.** Milestone: no deploy. Blocks slice 8.
  [The image slimming issue](https://linear.app/zgeoff/issue/GEO-2248) is a session with you, and it
  can change image rule 1. Four choices wait for it, each with its intended answer:
  - The base of each tool image. Intended: per image, a minimal glibc base with the Bun binary
    copied in for the fetcher, and Debian slim with Bun where Debian packages are needed. It waits
    for "no-shell base" under "Not checked".
  - The fetcher as one compiled binary. Intended: `bun build --compile` only together with a base
    that holds no Bun. Alone it saves nothing: Bun is 103 MB of the base, and a compiled host is 110
    MB.
  - A slimmer Chromium. Intended: Debian's `chromium-headless-shell`, updated with the base, for the
    first browser image. A pinned download with a recorded checksum is measured beside it. No own
    build.
  - A size budget per image. Intended: a recorded budget per image, which the Images workflow checks
    on each pull request. Each budget is the image's size after the bundled conversation guest, plus
    a margin.
- **fetch base issue.** Milestone: no deploy. Blocks slice 8. The fetch image's 2 `FROM` lines pin
  no digest, and no tracker issue covers the pin. Intended: one follow-up of the image session pins
  the base by digest, unless the session changes image rule 1.
- **image set issue.** Milestone: not set. Blocks slice 6. The image set has no tracker issue and no
  milestone of its own. The first-pass doc files it under
  [the image slimming issue](https://linear.app/zgeoff/issue/GEO-2248). Options: an issue of its
  own; a part of the image slimming issue. Neither is stated as intended.
- **size rows order.** Milestone: not set. Blocks slice 6. The image set's first pull request reads
  `sizeRows` and a typed `imageKey` from the harness record, which
  [model harnesses](../model-harnesses.md) defines. Which lands first is unstated. Options: the
  harness record lands first; the image set lands first with `getHarnessSize` reading a fixed row
  for each use; one pull request holds both.
- **sandbox slice order.** Milestone: not set. Blocks no slice. These orders have no stated reason,
  so each is not settled: `buildSandboxSizes` and the `sizes` value in the image set's first pull
  request and not in the size table's; the image session before or after the image set. The slices
  state only the dependency facts.
- **ordering argument.** Milestone: no deploy. Blocks part of slice 9. The form of the Kubernetes
  component's ordering argument, needed only when "dependsOn check" fails. No option exists. Bring
  the check's result to you before any build.

## Not checked

- **count across sleep.** Milestone 1. Blocks slice 3. Whether a sleeping sandbox holds its count of
  memory kills. Check: the test imp test of slice 2 sleeps and wakes a sandbox and prints the count
  before and after.
  - The same count: build the watcher as in [the memory-kill signal](../memory-kill-signal.md).
  - A count of 0 after the wake: do not build the watcher. It would miss a kill that falls after a
    guest program's read and before a sleep that the watcher cannot see, and it would write a
    `counter_reset` line after each such wake. No log line ships, the day's count is a read of the
    runtime's log on the host, and you get the result before anything else is built.
- **sizes under real work.** Milestone 1. Blocks no slice. No measurement covers a conversation turn
  with nixie's real tool server, or a started task's step, at 512 and 384 MiB. Check, by hand, on a
  throwaway nixie built with the sizes, on a test runtime and never against a production deployment:
  send 1 conversation turn that calls a tool of the real tool server, start 1 step of a started
  task, then read each guest's `memory.events` file through the runtime's exec.
  - `oom_kill 0` in both: the sizes hold.
  - A kill: raise the row to the next even step that passes, before any deployment takes the sizes.
- **codex row estimate.** Milestone 4. Blocks no slice. The `codexTask` figure of 384 MiB is the
  `systemTask` figure. Check: the Codex probe in `../sketches/sandboxes/01-usage.ts`, section D, in
  the pull request that adds the Codex image. A pass makes the Codex harness selectable. A kill
  raises the row by an even step.
- **installed cli path.** Milestone 1. Blocks part of slice 4. How the Agent SDK lane's start hook
  finds the installed CLI's path. Check: read how the pinned Agent SDK finds its CLI when
  `pathToClaudeCodeExecutable` is unset, for glibc and for musl. Add `findInstalledCLI()` beside the
  build script and a test that runs `<path> --version`. The test's command:
  `bun run test:agent-sdk guests/conversation/src/find-installed-cli.agent-sdk.test.ts`
  - Exit 0 on the CI runner: the lane's start hook passes that path as `--cli-path`, and the test
    runs at each Agent SDK bump.
  - The lookup cannot be copied in a few lines, or it differs by runner: do not write the hook. The
    bundle's turn test moves to the Images workflow, which runs it in the built image, where the CLI
    is at `/app/claude`.
- **needs refs.** Milestone: not set. Blocks no slice. Whether one `needs` value gives every image
  job's `ref` in a workflow of reusable workflows. Check: the Images workflow's rehearsal on the
  image set's first pull request.
  - It reads each `ref`: the release reads the same value.
  - It does not: the manifest job lists each image job's output by hand, and the workflow test also
    fails when a key of the tuple has no such line.
- **no-shell base.** Milestone: no deploy. Blocks no slice. Whether the runtime's agent starts a
  guest on a base with no shell. The source gives no command for this probe. The first-pass doc's
  steps are its writer's own: build the fetch image on a minimal glibc base with the Bun binary
  copied in, and run one fetch in it with `bun run test:imp apps/server/`.
  - The fetch passes: the fetcher takes the minimal base, and the compiled binary is worth
    measuring.
  - The guest does not start: every tool image builds on Debian slim with Bun.
- **pinned chromium size.** Milestone: no deploy. Blocks no slice. The size of a browser image with
  a pinned Chromium download. Check: build it beside the Debian package's image and record both
  sizes before the first browser image is designed.
- **dependsOn check.** Milestone: no deploy. Blocks slice 9. Whether Pulumi passes a component's
  `dependsOn` down to its children. Check: 1 test on Pulumi's mocks under
  `bun run test deploy/pulumi-k8s/` calls `createNixie(name, args, { dependsOn: [step] })` and reads
  the dependencies that the ConfigMap, both Secrets and the StatefulSet are registered with.
  - Each child depends on the step: no argument is needed. State `dependsOn` in the component's
    README.
  - A child does not: stop, and bring the result to you.

## Not written

- **kills field.** Milestone 1. Blocks slice 3. Whether `kills` on a `sandbox.memory_kill` line is
  the guest's count or the rise since the last read. The sketch writes the count.
- **size refusal text.** Milestone: not set. Blocks slice 6. The sentence that `buildSandboxSizes`
  throws for an override that is odd or under 128. Intended rule: it holds the row's name.
- **manifest refusal text.** Milestone: not set. Blocks slice 6. The 2 sentences that
  `buildSandboxManifest` throws. Intended rule: one holds a key of the tuple with no ref, and one
  holds a ref with no key.
- **sketch signatures.** Milestone 1. Blocks no slice. The return types and some parameters in
  `02-types.ts` are the sketch's reading, as its header lists. Intended rule: the builder sets them
  and matches the built code.
- **several missing images.** Milestone: not set. Blocks slice 6. The start's refusal is written for
  one missing image. Its text for 2 or more is not. Intended rule: the refusal holds each image and
  what needs it.

## Known faults

- **baseline line.** Milestone 1. Blocks slice 3. The watcher reads a found sandbox before its first
  `spawn`, and a count above 0 gives a `no_baseline` line. That line has an `ended` field, and no
  guest program has ended. The docs follow the read before the first `spawn`, and the line's `ended`
  value is not written.
- **blocking mark.** Milestone 1. Blocks no slice. Linear marks
  [the runtime's work on reserved memory](https://linear.app/zgeoff/issue/GEO-2387) as blocking
  [the sandbox sizes issue](https://linear.app/zgeoff/issue/GEO-2417).
  [Decision 0054](../../../decisions/0054-sandbox-sizes-and-the-memory-kill-signal.md) records that
  the sizes do not wait for it. The docs follow the decision.
- **nixie files line.** Milestone: no deploy. Blocks no slice.
  [The Kubernetes component issue](https://linear.app/zgeoff/issue/GEO-1044) has the line "the
  deployment's own nixie files are gone". The design has the ingress, the certificate, the restore
  and the image add in the deployment's program, so the line cannot pass as written. The docs follow
  the design.
- **null size row.** Milestone: not set. Blocks slice 6. The sandbox sketch has
  `getHarnessSize(sizes, harness, use)` return `sizes[row]`. The harness sketch has
  `sizeRows.conversation` as null on the Codex harness. The function has no stated result for a null
  row.
