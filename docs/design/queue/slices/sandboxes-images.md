# Sandboxes: the image work as slices

These are slices 6 to 10 of the sandboxes family. Slices 1 to 5, the memory cut, are in
[the sandbox slices](sandboxes.md). The docs are [the sandbox sizes](../sandbox-sizes.md),
[the sandbox images](../sandbox-images.md), [the sandbox image set](../sandbox-image-set.md) and
[the Kubernetes step order](../kubernetes-step-order.md). The sketches are in
`../sketches/sandboxes/`, and the open items are in [the open list](../open/sandboxes.md).

Each "Needs" line is a dependency fact. Where 2 slices have no dependency, they land in either order
`(open: sandbox slice order)`. Run `bun run models && bun run test:bundles` once before the unit
tests of a slice. The test imp lane takes the variables of the
[imp isolation runbook](../../../runbooks/imp-isolation-tests.md). No slice has a migration, and a
rollback of any slice needs no step.

Each slice has the ID `sandboxes-<n>`, which is unique across the queue, and each "Needs" names a
slice by its ID. In any other field of this file, "slice n" means `sandboxes-n`.
[The work list](../work-list.md) gives the build order.

### sandboxes-6. The image set

No issue of its own `(open: image set issue)`.

- **Outcome:** The tuple, the image records and the fit check are in the sandbox module. The 3
  schemas come from `buildImageShape`. nixie refuses to start on a manifest that lacks a needed
  image, and adds only the needed images. `nixie sandbox-manifest` takes `--needed`.
  `buildSandboxManifest` replaces `build-sandbox-manifest.sh`, and the `release.json` builder takes
  `--sandbox-manifest` in place of `--conversation` and `--fetch`. The server builds `sizes` with
  `buildSandboxSizes` and each reader takes `sizes[row]` in place of its import. The release
  pipeline doc and the impd names doc use "image key" in place of "sandbox kind" for a manifest's
  key.
- **Follows:** every section of the sandbox image set; "The size table" in the sandbox sizes, for
  `buildSandboxSizes` and `getHarnessSize`; `02-types.ts`, sections A, D, E and F; `01-usage.ts`,
  sections A, F and G; `03-flow.ts`, sections C, D and F.
- **Needs:** sandboxes-1, harnesses-3. harnesses-3 is the harness record slice in
  [the harness slices](harnesses.md) `(open: size rows order)`. The open items "size refusal text",
  "manifest refusal text" and "several missing images". It lands ahead of harnesses-5, the first
  pull request that adds an image.
- **Check:** `bun run test modules/sandbox/ apps/server/ scripts/`. Each test of the filter passes a
  test tuple of 3 keys, `conversation`, `fetch` and `extra`, because every deployment needs both
  real keys. None starts the server or runs the command's entry, except where stated.
  - `checkImageFit` gives each missing image.
  - `loadSandboxManifest` with the test tuple reads a manifest file that holds 2 of the 3 keys.
    `pickNeededImages` returns 2 for needs that name those 2, on that manifest and on one that holds
    all 3.
  - `printSandboxManifest` with the test tuple prints those 2 from a manifest of 3, and throws the
    start's refusal when the manifest lacks one of them.
  - A parse with each of the 3 schemas, built from the test tuple, fails on a key outside it.
  - On the real tuple, the server's start refuses a manifest that lacks `fetch`, and its refusal
    holds the image. `nixie sandbox-manifest --needed` exits non-zero on the same manifest. These 2
    are the only tests that use the real start and the real command.
  - The workflow test fails on a fixture with a job taken out.
  - `buildSandboxSizes` refuses an odd override and one under 128, with the row's name.
  - A test over the part declarations fails when a part that creates a sandbox declares no `images`.
  - Images workflow, on the pull request: the rehearsal builds every key of the tuple, and
    `check-printed-sandbox-images.ts` and `rehearse-release-assets.ts` pass with no key named in
    either. The rehearsal settles "needs refs" in the open list.
  - Test imp, a hand step for the agent that builds the pull request: a throwaway nixie from its
    images, set up as the Compose guide describes, on a runtime that holds none of them. Its log
    holds one `image.added` line for `conversation` and one for `fetch`. This shows the add on a
    real runtime and not the filter. No step sends anything to a production deployment.
- **Deploy:** a deployment's script that never passes `--needed` reads the output it read before.
- **Milestone:** 4, because harnesses-3 is milestone 4. The design sets none
  `(open: image set issue)`.

### sandboxes-7. The image session

[The image slimming issue](https://linear.app/zgeoff/issue/GEO-2248).

- **Outcome:** You confirm or change image rule 1 and each of the 4 choices of "image session" in
  the open list. A Linear document on the issue records the decisions, and each follow-up is filed
  as its own issue with an outcome and an acceptance.
- **Follows:** "The image rules" in the sandbox images.
- **Needs:** sandboxes-4. It gives image rule 2 and the size budgets. This slice comes before
  harnesses-5, the first pull request that adds an image, because it can change image rule 1. The
  checks "no-shell base" and "pinned chromium size" in the open list inform it.
- **Check:** both are steps for you: the decisions are in the Linear document, and each follow-up is
  filed.
- **Milestone:** no deploy.

### sandboxes-8. The fetch image's base

No issue `(open: fetch base issue)`.

- **Outcome:** The fetch image's 2 `FROM` lines pin their base by digest.
- **Follows:** image rule 1 in the sandbox images.
- **Needs:** sandboxes-7. It can change image rule 1 and the base.
- **Check:** the Images workflow builds the fetch image on the pull request, and
  `bun run test:imp apps/server/` passes a real fetch on it.
- **Milestone:** no deploy.

### sandboxes-9. The Kubernetes step order

[The Kubernetes component issue](https://linear.app/zgeoff/issue/GEO-1044). It blocks
[the 2 follow-ups that change the component](https://linear.app/zgeoff/issue/GEO-1693)
([the second](https://linear.app/zgeoff/issue/GEO-1694)).

- **Outcome:** A test shows that a caller's own step comes before the ConfigMap, both Secrets and
  the StatefulSet, and the component's README states how a caller orders it.
- **Follows:** "The contract" in the Kubernetes step order; `01-usage.ts`, section H.
- **Needs:** nothing. The test is "dependsOn check" in the open list, and it comes first. When it
  fails, the slice stops at "ordering argument".
- **Check:**
  - `bun run test deploy/pulumi-k8s/`: a test in `create-nixie.test.ts` shows that each of the 4
    resources depends on the caller's step.
  - npm packages workflow, on the pull request: the packed component imports in Node.
  - A step for you, in the deployment's repo, after a release carries the slice: a preview against
    the component shows no resource change. The preview reads the live stack and changes nothing.
- **Milestone:** no deploy.

### sandboxes-10. The docs around this design

No issue.

- **Outcome:** The glossary holds the terms of this family, the queue design's README lists the 5
  docs, and decision 0054's design link points at [the sandbox sizes](../sandbox-sizes.md).
- **Follows:** no doc section. The 5 docs of this family give the terms.
- **Needs:** nothing.
- **Check:** `bun run check:docs` reports no broken link in those files.
- **Milestone:** no deploy.

## Work in other families that builds on these slices

- harnesses-5, the pull request that adds the `codex` image, adds the key and the record,
  `imageKey: 'codex'` and `sizeRows` on the Codex harness record, a `codexTask` row at 384 MiB, and
  the probe of "codex row estimate" with the guest script `codex-task.sh`. The model-harnesses
  family owns it. It needs sandboxes-6 and sandboxes-7.
- A pull request that adds a `worker` image adds the key, the record and the worker part's `images`.
  A `worker` row and a `worker` use in `sizeRows` arrive with a probe. It needs sandboxes-6. No
  slice holds this work: [task workers](../task-workers.md) has a worker's own image and size out of
  scope, and tasks-9 runs a worker at the `systemTask` row.
