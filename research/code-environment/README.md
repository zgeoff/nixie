# Spike: the code environment

This spike runs Node.js, Python and shell programs in nixie's code image and worker image, and
measures the size of each image. It informs whether the image contents and sizes in the
[sandbox adapter design](../../docs/design/platform/connectors/sandbox-adapter.md#images) are
enough. The code image is Debian with Node.js, Python and a toolbox of jq, ripgrep, grep and the
common Linux file and text tools. The worker image is the conversation image, which holds Bun and
Claude Code, plus the same runtimes and toolbox.

## Question

Do the code and worker images run representative Node.js, Python and shell programs, and how large
is each image?

## Answer

- All 3 programs ran in both images under the code tool's limits: no network, 1 vCPU and 1 GiB of
  memory. Each of the 30 code runs exited 0 and printed the report that the spike expects.
- Python holds only its standard library, so imports of numpy, pandas and requests failed. Node.js
  also loads the 869 libraries that Debian's npm package installs, such as lodash. Each pip and npm
  install failed, because a code run has no network.
- The code image holds 453 MiB of files, and a host pulls 115 MB of compressed layers for it. The
  worker image holds 1147 MiB and pulls 428 MB, and its runtimes and toolbox add 366 MiB of files.
- npm brings 182 MiB of the code image's files. The spike built the code image without npm, which
  holds 271 MiB and runs all 3 programs.
- Both images ship Node.js 20.19.2 from Debian 13, and upstream support for Node.js 20 ended on
  2026-04-30.

Drop npm and the Node.js libraries it brings from the code image, and pick a supported Node.js line
and any Python data packages before the code tool ships.

## Run it

Run the script on any machine with Docker, from this folder. It refuses to start when an image named
`spike-ce-*` exists, and it removes its images on exit.

```bash
bash run.sh
```

The [setup](results.md#setup) gives the versions, the images and the limits.

## Results

The [results](results.md) hold the code run, probe and size tables, and the
[results folder](results/) holds every recorded code run.

## Untested

The spike timed no Node.js or Python process start from a cold page cache, and it ran nothing in an
imp, the microVM that runs each sandbox. The [untested list](results.md#untested) gives the rest.
