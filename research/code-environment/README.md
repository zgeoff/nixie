# Spike: the code environment

This spike runs a report program in Node.js, Python and shell in nixie's code and worker images,
under the code tool's limits, and measures the size of each image. It informs whether the image
contents and sizes in the
[sandbox adapter design](../../docs/design/platform/connectors/sandbox-adapter.md#images) are
enough.

## Question

Do the code and worker images run representative Node.js, Python and shell programs, and how large
is each image?

The code tool runs a program that the model writes, with no network, 1 vCPU and 1 GiB of memory. For
the conversation or a task, it runs the program in a fresh sandbox from the code image: Debian with
Node.js, Python and a toolbox of jq, ripgrep, grep and the common Linux file and text tools. A
worker runs the program in its own sandbox, from the worker image: the conversation image, which
holds Bun and Claude Code, plus the same runtimes and toolbox.

## Answer

- Each of the 3 programs sums 20 invented orders per region, and uses more of its language's
  standard library or the toolbox, such as SQLite, zip, gzip and jq. Each one ran 5 times in each
  image, and all 30 code runs printed the expected report.
- numpy, pandas and requests are absent from both images, so a Python program that imports one of
  them fails. A Node.js program can also `require` the 869 libraries that Debian's npm package
  installs, such as lodash. With no network, every pip and npm install failed.
- The code image holds 453 MiB of files, and a host pulls 115 MB of compressed layers for it. The
  worker image holds 1147 MiB, and a host pulls 428 MB for it.
- npm brings 182 MiB of the code image's files. A third image, the code image without npm, holds 271
  MiB and ran the 3 programs with the same results.
- Both images ship Node.js 20.19.2 from Debian 13, and upstream support for Node.js 20 ended on
  2026-04-30.

Drop npm and its Node.js libraries from the code image, move to a supported Node.js line, and decide
whether to add numpy and pandas, before the code tool ships.

## Run it

Run the script from this folder, on a machine whose Docker uses the containerd image store, which
the pull sizes need. It refuses to start when an image named `spike-ce-*` exists, so that its
cleanup never removes an image it did not build.

```bash
bash run.sh
```

The [setup](results.md#setup) gives the versions, the images and the limits.

## Results

The [results](results.md) hold the code run, probe and size tables, and the
[results folder](results/) holds every recorded code run.

## Untested

The spike timed no Node.js or Python process start from a cold page cache, and it ran nothing in an
imp, the microVM that runs each nixie sandbox. The [untested list](results.md#untested) gives the
rest.
