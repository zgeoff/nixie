# The sandbox image set

nixie boots each sandbox from a sandbox image, and adds each image to the sandbox runtime before the
first sandbox that needs it. To add an image is to ask the sandbox runtime to pull it by its ref and
hold it under a name. This doc covers which sandbox images exist and which of them nixie adds at
start. One tuple in the sandbox module lists the images, and every schema, the release workflow and
the Images workflow follow from that tuple. At start, nixie works out from its config which images
it needs. It refuses to start when the release lacks one of them, and it adds and waits for the
needed images only. [The sandbox images](sandbox-images.md) covers what one image holds.

The sketches in `sketches/sandboxes/` hold the code shapes and the exact texts, and this doc holds
the rules. Each `(open: <name>)` mark has an item in [the open list](open/sandboxes.md), which links
the tracker issue.

Terms this doc uses:

- An image key is the short name of one sandbox image, such as `fetch`. "Key" alone means an image
  key.
- The sandbox manifest is the file `/app/sandbox-manifest.json` inside each release's nixie image.
  It maps each image key to that image's ref.
- A ref is an image's registry address with its digest.
- A part is one unit of the server's start, declared in a part declaration.
- The harness record is the value that describes one model harness.
  [Model harnesses](model-harnesses.md) owns it.
- A size row is one entry of the sandbox size table. [The sandbox sizes](sandbox-sizes.md) owns the
  table.
- The [glossary](../../glossary.md) holds every other term, such as sandbox kind and model profile.

## Built

This section is what the code does. Each section after it is the design.

- The sandbox images are `conversation` and `fetch`. The code writes the 2 keys out by hand in 3
  strict schemas: the schema of the sandbox manifest's loader, the schema of the printed sandbox
  images, and the schema of the release's images.
- `build-sandbox-manifest.sh` takes the 2 refs as its 2 arguments. Two step scripts of the release
  read the variables `CONVERSATION` and `FETCH`. `release.yml` and `images.yml` hold a job or a step
  for each image. The `release.json` builder takes the flags `--conversation` and `--fetch`.
- Only a release's own loader reads that release's sandbox manifest.
- The 6 sandbox kinds run on the 2 images. The harness record holds `imageKey` as a plain `string`,
  and `getHarnessImage` looks the image up with an invariant whose message holds the key.
- At start, `registerSandboxImages`, the body of the `add_images` part, adds every image of the
  manifest, one after another, and writes an `image.added` log line for each. The state `images` is
  ready after the last one. `toImageNames` gives each part that creates a sandbox the names of the
  images.
- `nixie sandbox-manifest` prints an object keyed by image key, with a `name` and a `ref` for each
  image. It reads only the manifest. `release.json` holds `sandboxImages` at `format` 1.
- A deployment's own scripts read the output of `nixie sandbox-manifest` and `release.json`. Those
  scripts live outside this repo, and one script reads the output of many releases.
- The `nixie health` command takes a `--config` flag for the config's path.

## The keys, the records and the fit check

Shape: [the tuple, the image records and the fit check](sketches/sandboxes/02-types.ts), section D
of that file.

- The tuple `sandboxImageKeys` holds `conversation` and `fetch`.
- A key identifies an image. It never identifies a sandbox kind or a size row: several kinds run on
  one image, and one image runs at several sizes.
- The tuple holds a key only when a harness record or a part declaration uses that key. Each key
  costs a build, a public registry package and a pull check in every release, whether or not a
  deployment uses the image.
- Each key has one image record, which holds the image's registry package and its Dockerfile.
- The fit check is the function `checkImageFit`. It compares the images that a config needs with the
  images that a manifest holds. It returns each missing image with what needs it.
- `checkImageFit` is generic over the key type, so a test passes a tuple of its own. Product code
  passes no type argument.

## The 3 outputs

Shape: [the 3 outputs and the functions between them](sketches/sandboxes/02-types.ts), section E. A
usage example: [the command and its output](sketches/sandboxes/01-usage.ts), section F.

- The 3 outputs are the sandbox manifest, the output of `nixie sandbox-manifest`, and
  `sandboxImages` in `release.json`. Each is an object keyed by image key.
- One builder in the server, `buildImageShape`, makes the schema of each output from the tuple it is
  given. The code never writes a key out in a schema. A parse with any of the 3 schemas fails on a
  key that the tuple lacks.
- The manifest's keys are optional in its schema. A manifest that lacks a key therefore loads, and
  the fit check finds the missing image and what needs it. A release always writes every key.
- The keys of `sandboxImages` in `release.json` are required. `release.json` is at `format` 1 with
  any number of keys.
- An image's name is `nixie-<key>-<12 hex>`. The 12 hex characters come from the image's digest.
- An entry of the printed output holds a `name` and a `ref` and no other field.
- A third key is an added field for a deployment's script, and the compatibility rule for
  `release.json` allows an added field. A list of entries, or an object around the entries, would
  make a script written for another release misread the output.
- An output never holds a sandbox's memory, CPU or disk limit. A limit belongs to a size row.
- `loadSandboxManifest`, `pickNeededImages` and `printSandboxManifest` each take the tuple as their
  first argument and are generic over its key type. Only 2 callers pass `sandboxImageKeys`: the
  server's start and the command's entry.

## The command

- With no flag, `nixie sandbox-manifest` prints every image of the manifest and reads no config.
- With `--needed`, the command reads the config at `--config`, as `nixie health` does, and prints
  only the images that the server would add. `--needed` is false by default.
- With `--needed`, when the manifest lacks a needed image, the command exits non-zero and prints the
  refusal that the server's start gives.
- A release whose command has no `--needed` flag fails on the flag. A deployment's script runs the
  command from the nixie image that the deployment is about to roll to. So the script passes
  `--needed` only for a release whose command has the flag.

## Where an image key is declared

- The harness record holds a harness's image as `imageKey`, of type `SandboxImageKey`.
- This doc owns the type `SandboxImageKey`. [The sandbox sizes](sandbox-sizes.md) owns the type
  `SandboxSizeRow`. The harness record uses both types and defines its own fields.
- A part that creates a sandbox declares its images in the optional `images` field of its part
  declaration. Shape: [the part's `images` field](sketches/sandboxes/02-types.ts), section E.
- When a part creates a sandbox and declares no `images`, the server starts. The part's first create
  then fails on the image lookup's invariant, whose message holds the key. A unit test over the part
  declarations fails on such a part, so the fault shows on the pull request.

## The order at start

Flow: [the images at start](sketches/sandboxes/03-flow.ts), section C. Text:
[the refusal](sketches/sandboxes/02-types.ts), section F.

1. nixie loads the config and the manifest. nixie refuses to start when either file fails its
   schema.
2. `listImageNeeds` returns one need for each configured model profile, from the profile's harness
   record. It then returns one need for each key that a part declaration's `images` returns. A
   profile under `models.selectable` counts, because a selectable profile starts a task at any time.
3. `pickNeededImages` throws when the fit check finds a missing image, before any part starts. nixie
   exits and never retries the start. The refusal holds the image, what needs it, and the keys that
   the manifest holds `(open: several missing images)`.
4. `pickNeededImages` returns the needed images only. Three readers take that value: the
   `add_images` part, `toImageNames`, and the sandbox adapter, which adds an image again before a
   create.
5. `registerSandboxImages` adds the needed images one after another. The state `images` goes from
   not ready to ready after the last needed image.

What follows from the order:

- When the config uses no harness or tool that needs an image, nixie neither adds that image nor
  waits for it.
- A profile that is configured and never used needs its harness's image. Each rollout pulls that
  image.
- When a config change needs an image that the sandbox runtime does not hold, the start pulls the
  image, and readiness waits for that pull.
- Each release's nixie image holds its own manifest with its own keys, so each release adds and
  waits for its own images. The sandbox runtime holds the images of another release until it evicts
  them.

## How a release publishes and pins each image

Flow: [a release publishes each image](sketches/sandboxes/03-flow.ts), section D.

- Each image has its own job in the release workflow, with the image's key as the job's name. The
  job pushes the image by digest.
- The `sandbox-manifest` job reads every image job's `ref` `(open: needs refs)` and calls
  `buildSandboxManifest`. That function throws on a key of the tuple with no ref and on a ref with
  no key, and its error holds the key `(open: manifest refusal text)`.
- The `sandbox-manifest` job has one output, the manifest. These stages read it: the nixie image
  build, the release notes, the pull check with no credentials, the tags, and the `release.json`
  builder, which takes `--sandbox-manifest <path>`.
- When the release workflow lacks a key's job, the release fails at the `sandbox-manifest` job,
  ahead of the nixie image build.
- A unit test reads `release.yml` and `images.yml`, and fails in each of these cases:
  - a key of the tuple has no job in `release.yml`;
  - a key of the tuple has no build step in `images.yml` whose `id` is the key;
  - a job's `image` differs from the image record's `repository`;
  - a job's or a step's `dockerfile` differs from the image record's `dockerfile`.

## What a pull request for another image holds

A pull request that adds a sandbox image holds these 5 things:

- the image's Dockerfile;
- its key and its image record;
- a job in `release.yml`, with the job's name in the `needs` of the `sandbox-manifest` job, and a
  step in `images.yml`;
- the harness record or the part declaration that uses the key;
- a size row, when the image serves a role that has none.

You then set the image's registry package public, once. The sandbox runtime pulls with no
credentials, and the release's pull check fails until the package is public.

This design adds no image. Three images are expected, and each arrives in its own pull request:

- The `codex` image arrives with the Codex harness, whose harness record holds the key.
- The `worker` image arrives with a `worker` key. The worker part's `images` returns the key only
  when the config sets the worker role. [Task workers](task-workers.md) owns the worker.
- A browser image needs a key, an image record, a part's `images` entry and a size row for a browser
  fetch. This design holds nothing else for a browser image.

## How a deployment adds the images before a roll

A deployment's own step runs `nixie sandbox-manifest` from the nixie image of the release that it
rolls to, and adds each printed entry under its `name` from its `ref`. Flow:
[the step, and what each form of script does with a third image](sketches/sandboxes/03-flow.ts),
section F.

- A script that walks the entries adds a third image with no change to the script.
- A script that reads `conversation` and `fetch` by name skips a third image. When the config needs
  that image, nixie adds it at start, if the sandbox runtime lets nixie's token add images. If it
  does not, the state `images` is not ready, and the state's reason holds the image.
- A script that stops on a key it does not know stops ahead of the roll.

## Not in scope

- Another image. The tuple holds `conversation` and `fetch`.
- A config key for a size.
- A committed catalog file of the images, a workflow matrix, or the size table in `release.json`.
- An object type keyed by any string in place of the tuple.
- Any field of the harness record. Model harnesses defines `imageKey` and `sizeRows`.
- An interface for the image build. The build has one technology, OCI images from Dockerfiles, and
  one registry.
