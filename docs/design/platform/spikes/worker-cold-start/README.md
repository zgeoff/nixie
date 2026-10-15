# Spike: worker cold start on the worker image

This spike times a fresh worker on the worker image, which adds Node.js, Python and a toolbox to the
conversation image, and a fresh fetch sandbox. The code runtimes add about 480 MB to the image and
no start time that 10 samples can see: from a cold page cache, a worker turn reached its first text
in a median of 2.6 s on the worker image and 3.0 s on the conversation image, both inside the
spread. So the 2.5 to 3 s to first text in [0003](../../../../decisions/0003-sdk-placement.md) holds
for the worker image, and nixie needs no separate, smaller worker image. A fresh fetch sandbox adds
about 0.5 to 0.9 s before its reply against a fetcher in a long-lived sandbox, which one sandbox per
fetch can afford. The spike ran in Docker inside an imp guest, which cannot create imps, so the imp
create time comes from imp's own design and the [imp worker spike](../imp-worker-start/README.md),
not from a run here.

## Question

1. How long do imp creation and first text take for a fresh worker on the worker image, and does the
   worker image need to be smaller than it is?
2. How long does a fresh fetch sandbox take to start, and is one sandbox per fetch affordable?

## Versions

| Component        | Version                                        |
| ---------------- | ---------------------------------------------- |
| Claude Agent SDK | 0.3.290, from the conversation guest           |
| Claude Code      | 2.1.290, from the SDK's native package         |
| Bun              | 1.4.2, the conversation and fetch images' base |
| Node.js, Python  | 20.19.2, 3.13.5, from Debian                   |
| ripgrep, jq      | 14.1.1, 1.7                                    |
| Docker           | 29.8.2, overlayfs                              |
| Model            | `claude-haiku-5-5`                             |
| Machine          | imp guest, Linux 6.1.188, 2 vCPUs, 2 GiB       |

## Setup

[`run.sh`](run.sh) builds 4 images, runs every phase 10 times, and prints the summary:

- the conversation image, from the conversation guest's own Dockerfile;
- 2 turn images from [`Dockerfile`](Dockerfile), both on the conversation image with the imp worker
  spike's [`turn.ts`](../imp-worker-start/turn.ts) added. `RUNTIMES=no` adds nothing more, and
  `RUNTIMES=yes` adds the code environment that the
  [sandbox adapter design](../../connectors/sandbox-adapter.md#images) lists, which makes it the
  worker image;
- the fetch image, from the fetch guest's own Dockerfile.

[`bench.ts`](bench.ts) takes every time from the machine's clock around a `docker` CLI call, and
stamps each line of the container's output on arrival. A cold sample empties the kernel's page cache
first, so the container reads Bun, Claude Code and the fetcher from disk, as a new imp's guest does
from its cloned disk. A warm sample follows its cold sample at once, with a new container. Samples
alternate the image that goes first.

- **start**: `docker run --rm` of `true` in each image, the cost of Docker alone.
- **turn**: a new container per turn, which runs `turn.ts` with every built-in tool off, no MCP
  server, and the broker's proxy and CA passed in by name. The guest holds a placeholder token, and
  the imp's broker injects the real one.
- **fetch**: one fetch request frame for `https://example.com/`, sent either to a new container from
  the fetch image with the fetch sandbox's limits (1 vCPU, 512 MiB, no swap) or by `docker exec` of
  the fetcher in one long-lived container with the same limits. A fetch counts to the arrival of the
  reply's whole frame, and records the process's exit apart, because a new container's exit includes
  its removal.

[`summarize.ts`](summarize.ts) prints the median and the 90th percentile (nearest rank) of each
cell. The [`results`](results/) folder holds the recorded run: every sample line, the build times,
the image sizes and the summary. The fetch phase comes from a later run of `run.sh` with
`SPIKE_PHASES=fetch`, which keeps the other phases' results.

## Run it

Run it as root in an imp guest that has Docker and imp's broker, from this folder. It refuses to
start when an image or container with one of its names exists, and a trap removes them on exit.

```bash
bash run.sh
SPIKE_PHASES=fetch bash run.sh
```

The second form runs only the named phases, and keeps the recorded results of the others.

A run makes about 40 short model calls and takes about 10 minutes.

## Answer

Each table gives the median and the 90th percentile of 10 samples, in milliseconds. All 40 turns
exited 0 with text, and all 40 fetches returned the page with status 200.

### 1. A fresh worker

Guest-side times count from the `query()` call; the module load counts from the process's start.

| Image        | Cache | Module load | Init median | Init p90 | First text median | First text p90 |
| ------------ | ----- | ----------: | ----------: | -------: | ----------------: | -------------: |
| conversation | cold  |         346 |        1612 |     2042 |              3020 |           3257 |
| worker       | cold  |         358 |        1444 |     1582 |              2576 |           3303 |
| conversation | warm  |         238 |         730 |     1250 |              2312 |           3461 |
| worker       | warm  |         237 |         788 |     1477 |              2218 |           2994 |

The worker image is no slower than the conversation image. Every gap between the two sits inside the
spread of either, and in the cold medians the worker image is the faster one. A turn reads Bun, the
SDK and the Claude Code binary, and never touches Node.js, Python or the toolbox, so the extra files
stay on disk unread. The model call varied more than the images did: the SDK's `duration_api_ms` had
a median of 1220 to 1473 ms per cell, so first text minus init carries about 1.3 s of API time.

A cold page cache adds about 0.7 to 0.9 s before init, against about 1.1 s in the imp worker spike's
new imp. Init after a warm cache stays at about 0.75 s, against about 0.2 s in a warm imp there,
because every container here starts Claude Code with an empty home, on a smaller, nested machine.

Counted from before `docker run`, the cold first text arrives at a median of 3436 ms on the worker
image (p90 4521) and 3877 ms on the conversation image. Docker's own cold start takes 635 ms of
that, where a new imp takes 472 ms to answer.

### Imp creation on the worker image

The image does not enter an imp create's path, so the imp worker spike's 472 ms holds for the worker
image. impd turns each OCI image into one sparse ext4 file, once per image, and clones that file for
each new imp's disk, so the clone costs the same at any image size. The
[boot template](https://github.com/zgeoff/impz/blob/v2.0.1/docs/architecture/lifecycle/boot-templates.md)
that a create restores is keyed by vCPU count and memory size, never by image, because the template
never opens a user disk. The image's size shows in its first conversion and in disk space, once per
image digest.

| Image        | Docker size | Build time |
| ------------ | ----------: | ---------: |
| conversation |     1.03 GB |       21 s |
| worker       |     1.51 GB |      106 s |
| fetch        |      252 MB |        1 s |

The conversation image carries both of the SDK's native Claude Code packages, the glibc one (239 MB)
and the musl one (233 MB), and the glibc guest runs only the first. Dropping the musl package saves
about half of what the code runtimes add.

### 2. A fresh fetch sandbox

| Route                                     | Cache | Reply median | Reply p90 | Exit median |
| ----------------------------------------- | ----- | -----------: | --------: | ----------: |
| a new container per fetch                 | cold  |          824 |      1070 |         998 |
| a new container per fetch                 | warm  |          364 |       384 |         568 |
| the fetcher in a long-lived container     | cold  |          572 |       658 |         588 |
| the fetcher in a long-lived container     | warm  |          167 |       238 |         183 |
| `docker run` of `true` in the fetch image | cold  |              |           |         632 |
| `docker run` of `true` in the fetch image | warm  |              |           |         409 |

A new container's removal adds about 170 ms after the reply from a cold cache and about 200 ms from
a warm one. That time falls after the reply, so it stays off the fetch's path.

The fetcher's own cold start in a new sandbox, with the page's fetch inside it, lies between 0.19 s
and 0.57 s. The low end is the new container's reply less the cold `docker run` of `true`, whose
time includes a removal, so it subtracts too much. The high end is the fetcher in the long-lived
container from a cold cache, whose time includes the `docker exec` call's own cold reads. A fresh
fetch sandbox on imp therefore reaches its reply in about 0.7 to 1.0 s: a create of about 0.47 s,
then the fetcher from a cold disk. The fetcher in a long-lived sandbox replies in about 0.17 s, so a
sandbox per fetch adds about 0.5 to 0.9 s to each fetch.

One sandbox per fetch is affordable. A worker's model call took a median of 1.2 to 1.5 s of API time
in this run, so 0.5 to 0.9 s per fetch adds under one model call. The fetch sandbox's shape (1 vCPU,
512 MiB) gets its own boot template, whose first boot costs about 0.8 s once per impd. Each fetch's
imp holds its memory only for the fetch, and nixie can destroy it after the reply, off the fetch's
path.

## Untested

- A real imp create from the worker image or the fetch image. This machine is an imp guest without
  KVM, so it cannot run impd; the create figures come from the imp worker spike and imp's design.
- An `impz image build` of either image, and its conversion time into impd's disk format.
- A worker turn with nixie's tools over MCP, which the imp worker spike measured at about 20 ms more
  to init.
- A worker that runs code: a Node.js or Python start from the worker image's cold disk.
- Fresh fetch sandboxes started in parallel, and their memory on the host.
