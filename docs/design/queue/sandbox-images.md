# The sandbox images: the image rules and the bundled conversation guest

nixie boots each sandbox from a sandbox image, an OCI image that holds the program the sandbox runs.
This doc covers 2 things that decide what a sandbox image holds. The first is the 5 rules that every
sandbox image follows. The second is the conversation image, which follows rule 2: it runs the
conversation guest from bundles. With a bundle, the process that hosts the Agent SDK uses under 50
MiB of memory, against 62 to 69 MiB when it runs from source, and it starts about 100 ms sooner.
[The sandbox image set](sandbox-image-set.md) covers which images exist and which of them nixie adds
at start.

The sketches in `sketches/sandboxes/` hold the code shapes and the exact texts, and this doc holds
the rules. Each `(open: <name>)` mark has an item in [the open list](open/sandboxes.md), which links
the tracker issue.

Terms this doc uses:

- A guest is the system inside one sandbox: its kernel and its processes.
- A guest program is a program that nixie starts in a guest. The conversation guest is the guest
  program that hosts the Agent SDK. It has 2 entries, `main` and `check`, and each entry is one
  program file.
- A bundle is one file that `bun build` makes from one entry and everything the entry imports.
- The CLI is the executable that the Agent SDK starts as a child process to run a model session.
- The harness record is the value that describes one model harness.
  [Model harnesses](model-harnesses.md) owns it. A harness guest is a guest program that a harness
  record holds.
- The sandbox manifest is the file in the nixie image that maps each image to its ref by digest.
  [The sandbox image set](sandbox-image-set.md) owns it.
- The sandbox runtime is the service that boots sandboxes. impd is the sandbox runtime of the imp
  adapter.
- The [glossary](../../glossary.md) holds every other term, such as sandbox kind and test sandbox.

## Built

This section is what the code does. Each section after it is the design.

- Each image's Dockerfile sits in the package it ships, under `guests/`.
- The conversation image's Dockerfile pins its base by digest. It copies `node_modules` and the
  workspace's source into the image, and the image runs `main.ts`.
- In an image, `buildGuestCommand` starts `bun /app/guests/<package>/src/<file>.ts`. On the test
  sandbox it starts the guest from the workspace's source. It reads the package and the entry's file
  from the harness record (`HarnessGuest`, `HarnessEntry`).
- The Agent SDK finds the CLI by its own lookup. The CLI ships in one package per platform, for
  glibc or for musl.
- The test sandbox and the preview build both run the conversation guest from source.
- The `zgeoff/import-zones` lint rule allows an import of the Agent SDK only in the conversation
  guest's package.
- The nixie image pins the conversation image by digest, through the sandbox manifest.
- The guest scripts `setup.sh` and `check.sh` of the memory spike, under `research/sandbox-memory`,
  use the guest's source paths in the image.
- The fetch image is 251 MB, and 71.5 MB compressed. It holds a 1 MB bundle on a Debian slim base
  with Bun. The base is 182 MB of the image, and Bun is 103 MB of the base. The image's 2 `FROM`
  lines give the base by tag.
- A browser image built in the headless fetch spike is 1.06 GB, and 300 MB compressed.
- The sandbox runtime converts an image to a disk once per digest, and clones that disk for each
  sandbox. The time to create a sandbox therefore does not grow with the image's size: the median is
  522 ms on the fetch image and 588 ms on the larger conversation image.
- A release pushes each image by digest, writes the digests into the sandbox manifest, and tags
  last.
- The Images workflow builds every image on each pull request that changes one.

## The image rules

1. Each sandbox image builds for `linux/amd64` from the Dockerfile in its package. Each `FROM` line
   pins its base by digest. The digest pin waits for a session with you `(open: image session)`.
2. An image that hosts a harness guest holds one bundle per entry at `/app/<package>/<entry>.js`,
   and nothing of the workspace.
3. A release pushes each image by digest, writes the digests into the sandbox manifest, and tags
   last. A commit never holds the digest of a sandbox image.
4. A key of the sandbox manifest identifies an image. It never identifies a sandbox kind: 6 sandbox
   kinds run on 2 images.
5. Each image's registry package is public, because impd pulls with no credentials.

## What an image's size costs

Judge any work that makes an image smaller by these facts:

- A smaller image does not start faster and saves no memory. A file costs memory only while the
  guest reads it.
- Size costs disk. It also costs the pull and the conversion at each rollout, and nixie's readiness
  waits for both.
- A check of each image's size against a budget costs no extra build, because the Images workflow
  builds every image.

Three facts bind a browser image, whenever one is designed:

- A browser that reads hostile pages needs its security updates. A browser from the base's own
  package gets them with the base.
- Chromium needs Debian's libraries, so a browser image builds on a Debian base.
- The web fetch tool's retry with a browser takes its config from the fetch config. A browser image
  of any size works with that config.

Four choices wait for the same session with you `(open: image session)`: the base of the fetch image
and of each image after it, whether the fetch guest ships as a compiled binary, where a browser
image gets Chromium, and a size budget for each image.

## The bundled conversation guest

The conversation image holds 2 bundles and the CLI. It holds no `node_modules`, no source and no
workspace layout. Three sketch sections go with this section:

- [the image's contents and the build flags](sketches/sandboxes/02-types.ts), section G of that
  file;
- [the build script's command](sketches/sandboxes/01-usage.ts), section E;
- [the flow from build to start](sketches/sandboxes/03-flow.ts), section E.

### The build script

- One build script in the conversation guest's package builds both entries, with `--target bun` and
  with no minifying.
- The conversation image's Dockerfile and the bundle test both call that script. The bundle test is
  the test that sends one turn and one check through the 2 bundles.
- The script takes `--out` and `--cli-path`, and both are required.

### The image

- The image holds the 2 bundles at `/app/conversation/main.js` and `/app/conversation/check.js`, and
  the CLI at `/app/claude`. It is the base, the 298 MB CLI and the 2 small bundle files.
- The layout is `/app/<package>/<entry>.js`. A second harness with a guest of its own takes the same
  layout under its own package name.
- nixie gives each sandbox image a name that ends in part of the image's digest, as
  [the sandbox image set](sandbox-image-set.md) describes. A release with a changed conversation
  image therefore has another image name. The conversation's sandbox has that name in its spec, so
  nixie replaces the conversation's sandbox once at the first start of that release.

### How the bundle finds the CLI

- The bundle starts the CLI through the SDK's `pathToClaudeCodeExecutable` option.
- The CLI's path reaches the guest as a build-time constant, which the build script sets from
  `--cli-path`.
- The Dockerfile passes `/app/claude` as `--cli-path`. Only the Dockerfile tells the guest where the
  CLI is.
- A guest that runs from source has no such constant, and the SDK finds the CLI by its own lookup.
- The host never sets the CLI's path in an environment variable. Such a variable would put the SDK's
  name in host code that serves every harness.
- The SDK cannot look the CLI up in the image, because the image has no `node_modules`.

### The host's command

- In an image, `buildGuestCommand` starts `bun /app/<package>/<entry>.js`. It reads the package and
  the entry's file from the harness record.
- On the test sandbox, `buildGuestCommand` starts the guest from the workspace's source.
- The host's command and the image's layout ship in one release. A host never meets an image with
  the other layout, because the nixie image pins the conversation image by digest.

### The form of the bundle and its checks

- The bundle is not minified and is not a compiled binary. A compiled binary uses the same memory as
  a bundle and takes 110 MB on disk.
- The CLI uses 183 to 219 MiB of memory whatever hosts the SDK, so the bundle does not lower it.
- The bundle test starts the bundles from a folder with no `node_modules`. It therefore shows a
  bundle that finds the CLI by the constant alone `(open: installed cli path)`.
- When a bundle fails to load a module that the build cannot follow, such as a dynamic import, the
  bundle test fails.
- A step of the Images workflow runs `/app/claude --version` in the built conversation image and
  expects exit 0. The step fails when the CLI is missing at its path. It also fails when the image
  holds `/app/node_modules`.

## Not in scope

- A compiled binary of the conversation guest.
- A worker image and a browser image. Neither has a design.
- A change to what the fetch image holds, beside its base.
- An interface for the image build. The build has one technology, OCI images from Dockerfiles, and
  one registry.
