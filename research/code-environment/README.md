# Spike: the code environment

This spike builds the code image, sizes it, and runs representative Node.js, Python and shell
programs in the code image and the worker image under the code tool's limits. It checks the image
contents and sizes in the
[sandbox adapter design](../../docs/design/platform/connectors/sandbox-adapter.md#images) against a
run.

## Question

Do the code and worker images run representative Node.js, Python and shell programs, and how large
is each image?

## Answer

- Both images run all 3 programs: 30 of 30 runs, 5 per program in each image, exited 0 with the
  right report, with no network, 1 vCPU and 1 GiB.
- Each program uses only its language's standard library and the toolbox. A program that imports
  numpy, pandas or requests fails, and a code run cannot install a package, because it has no
  network.
- The code image holds 453 MiB of files and pulls as 115 MB of compressed layers. Docker counts 591
  MB on disk.
- The worker image holds 1147 MiB of files and pulls as 428 MB. The code runtimes add 366 MiB of
  files to the conversation image.
- npm brings 350 Debian packages and 182 MiB of files into the code image, and a code run cannot use
  npm with no network. The code image without npm holds 271 MiB and still runs all 3 programs.
- Both images ship Node.js 20.19.2 from Debian 13, a Node.js line whose upstream support ended on
  2026-04-30.

## Run it

Run it on any machine with Docker, from this folder. It refuses to start when an image with one of
its names exists, and a trap removes its images on exit.

```bash
bash run.sh
```

The [setup](results.md#setup) gives the versions, the images and the limits.

## Results

The [results](results.md) hold the program, probe and size tables, and the recorded run sits in the
[results folder](results/).

## Untested

A Node.js or Python start from a cold page cache, and any run in a real imp. The
[untested list](results.md#untested) gives the rest.
