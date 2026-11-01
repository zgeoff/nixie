# Spike results: the code environment

This spike runs a report program in Node.js, Python and shell in nixie's code and worker images,
probes what each image holds, and measures the size of each image. All 3 programs ran in both
images, under the code tool's limits. A Python program can import only the standard library, and a
Node.js program can also load the 869 libraries that Debian's npm package installs. The code image
holds 453 MiB of files and the worker image 1147 MiB, and npm brings 182 MiB of the code image's
files. Both images ship Node.js 20, whose upstream support ended on 2026-04-30.

## Question

1. Do the code and worker images run representative Node.js, Python and shell programs?
2. How large is each image?

The code tool runs a program that the model writes, under the limits in the
[coding design](../../docs/design/platform/connectors/coding.md#the-code-tool): no network, 1 vCPU,
1 GiB of memory, and no swap. The
[sandbox adapter design](../../docs/design/platform/connectors/sandbox-adapter.md#images) lists 2
images for it:

- **The code image** is the sandbox for a code run from the conversation or a task: Debian with
  Node.js, Python and a toolbox of jq, ripgrep, grep and the common Linux file and text tools.
- **The worker image** is the conversation image, which holds Bun and Claude Code for a model turn,
  with the same runtimes and toolbox added. A worker runs its code in its own sandbox, so its image
  needs the runtimes too.

## Setup

| Component    | Version                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Base         | Debian 13 (trixie) slim, pinned by digest                                                      |
| Node.js, npm | 20.19.2, 9.2.0, from Debian                                                                    |
| Python, pip  | 3.13.5, 25.1.1, from Debian                                                                    |
| Toolbox      | jq 1.7, ripgrep 14.1.1, GNU awk 5.2.1, sed 4.9, grep 3.11, file 5.46, curl 8.14.1, bash 5.2.37 |
| Agent SDK    | 0.3.306, in the conversation image                                                             |
| Docker       | 29.7.2, overlayfs on the containerd image store                                                |
| Machine      | Linux 6.6, 16 vCPUs, 30 GiB                                                                    |

The toolbox is 12 Debian packages:
`jq ripgrep file less procps findutils gawk sed grep coreutils ca-certificates curl`.

### Images

[`run.sh`](run.sh) builds these images:

| Image        | Built from                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| code         | [`Dockerfile`](Dockerfile): Debian, the runtimes and the toolbox, run as an unprivileged user                                 |
| conversation | the conversation guest's [`Dockerfile`](../../guests/conversation/Dockerfile)                                                 |
| worker       | the [worker spike's `Dockerfile`](../worker-cold-start/Dockerfile) with `RUNTIMES=yes`, on the conversation image             |
| no-npm       | [`Dockerfile.size`](Dockerfile.size) with the code image's packages, less npm                                                 |
| 5 group      | [`Dockerfile.size`](Dockerfile.size) with one package group each: node, node and npm, python, python and pip, and the toolbox |

The worker spike is the [worker cold start spike](../worker-cold-start/README.md), which built the
worker image first. A group image puts one package group alone on the Debian base, so the group's
size shows apart from the others.

### Programs and probes

Each program reads the same 20 invented orders from [`orders.csv`](programs/orders.csv) and prints
the order count, units, revenue and top item per region as one JSON line. A code run counts as right
when it exits 0 and its line equals [`expected.json`](programs/expected.json). Each program also
uses more of its language's standard library or the toolbox:

- [`report.mjs`](programs/report.mjs) writes the report through `node:zlib` and checks the round
  trip, and writes a `node:crypto` digest;
- [`report.py`](programs/report.py) loads the orders into `sqlite3`, groups them in SQL, takes a
  `statistics` median, and zips the report with `zipfile`;
- [`report.sh`](programs/report.sh) checks the input with `file` and ripgrep, sums it with awk and
  sort, and builds the report with jq.

A probe is a one-line command that checks one thing an image holds or refuses, such as an import or
an install.

[`bench.ts`](bench.ts) runs 5 rounds. Each round runs every program once in each of the code, worker
and no-npm images, and every second round takes the images in reverse order. Then `bench.ts` runs
each probe once in each of those images. Each code run is a new container under the code tool's
limits. The programs and their input are mounted read-only, and each program writes its files to a
tmpfs.

[`summarize.ts`](summarize.ts) prints the tables, and the [`results`](results/) folder holds every
code run's line, the image sizes and the summary.

## Answer

### 1. Representative programs

All 45 code runs printed the expected report, in every image. Each row holds one program in one
image, over its 5 code runs. The total time counts from before `docker run` to the container's exit,
and the program time counts inside the container, from the program's start to its exit. The p90 is
the nearest-rank 90th percentile, which with 5 code runs is the slowest one. All times are in
milliseconds, from a warm page cache.

| Image  | Program | Right | Total median | Total p90 | Program median | Program p90 |
| ------ | ------- | ----: | -----------: | --------: | -------------: | ----------: |
| code   | node    |   5/5 |          388 |       459 |             76 |          82 |
| code   | python  |   5/5 |          339 |       405 |             22 |          23 |
| code   | shell   |   5/5 |          299 |       378 |              8 |           9 |
| worker | node    |   5/5 |          402 |       452 |             77 |          85 |
| worker | python  |   5/5 |          338 |       399 |             23 |          26 |
| worker | shell   |   5/5 |          330 |       392 |              9 |          12 |
| no-npm | node    |   5/5 |          433 |       517 |             74 |          79 |
| no-npm | python  |   5/5 |          376 |       451 |             22 |          24 |
| no-npm | shell   |   5/5 |          360 |       396 |              8 |           8 |

Docker's own container start takes most of each total.

Each probe gave the same outcome in the code and worker images:

| Probe                                                                                    | Outcome     | Cause                               |
| ---------------------------------------------------------------------------------------- | ----------- | ----------------------------------- |
| `node -e 0`                                                                              | 50 to 60 ms | the Node.js process start           |
| `python3 -c pass`                                                                        | 8 to 9 ms   | the Python process start            |
| `node:zlib`, `node:crypto`, `node:worker_threads`, `node:child_process`                  | load        |                                     |
| `node:sqlite`                                                                            | fails       | Node.js 20 has no `node:sqlite`     |
| Python's `csv`, `decimal`, `hashlib`, `json`, `sqlite3`, `statistics`, `zipfile`, `venv` | import      |                                     |
| Python's `numpy`, `pandas`, `requests`                                                   | fail        | not installed                       |
| `require('lodash')`                                                                      | loads       | Debian's npm package installs it    |
| `npm --version`                                                                          | 9.2.0       |                                     |
| `pip install --user requests`                                                            | refused     | the system Python is managed by apt |
| `pip install requests` in a new venv                                                     | fails       | no network                          |
| `npm install lodash`                                                                     | fails       | no network                          |
| `curl https://example.com/`                                                              | fails       | no network                          |

The code image holds 896 Node.js libraries in `/usr/share/nodejs`, where Node.js resolves a
`require`. Debian's npm package brings 869 of them, such as lodash, chalk, glob, semver and yargs,
and the `nodejs` package brings the other 27. In the no-npm image, `require('lodash')` fails, and
`npm --version` and `npm install` fail with `npm: command not found`. Every other probe gave the
same outcome there.

The code image does not need npm for a program that uses only Node.js's own modules. A program that
loads one of npm's 869 libraries needs npm's package, and a code run cannot install anything else.

Both images get Node.js 20.19.2 from Debian 13. Node.js 20 reached the end of its upstream support
on 2026-04-30, by the
[Node.js release schedule](https://github.com/nodejs/Release/blob/main/schedule.json), so a
supported Node.js needs a source other than Debian 13's own package.

### 2. Image sizes

The code image holds 453 MiB of files, and the worker image 1147 MiB. The table counts each image 3
ways:

- **Files** counts every file in the image's root with `du`, in MiB: the image unpacked.
- **Pull** counts the compressed layers that a registry stores and a host pulls, in MB.
- **Docker disk** is the size that `docker images` prints, the same measure as in the worker spike.
  On the containerd image store, it counts both the unpacked files and the compressed layers.

| Image        | Files (MiB) | Pull (MB) | Docker disk | Debian packages |
| ------------ | ----------: | --------: | ----------: | --------------: |
| Debian base  |          84 |        30 |      120 MB |              78 |
| code         |         453 |       115 |      591 MB |             499 |
| no-npm       |         271 |        94 |      380 MB |             149 |
| conversation |         781 |       344 |     1.16 GB |              80 |
| worker       |        1147 |       428 |     1.64 GB |             499 |

The worker image's runtimes and toolbox add 366 MiB of files and 84 MB of pull to the conversation
image, and 480 MB of Docker disk. The worker spike measured the same 480 MB on a conversation image
of 1.03 GB, so the runtimes' size held while the conversation image grew.

Each group image, on the Debian base alone:

| Group          | Packages                           | Files (MiB) | Over the base (MiB) |
| -------------- | ---------------------------------- | ----------: | ------------------: |
| node           | `nodejs`                           |         185 |                 101 |
| node and npm   | `nodejs npm`                       |         406 |                 322 |
| python         | `python3`                          |         120 |                  36 |
| python and pip | `python3 python3-pip python3-venv` |         138 |                  54 |
| toolbox        | the toolbox's 12 packages          |         120 |                  36 |

npm brings 350 of the code image's 499 Debian packages, among them `node-gyp`, Python and the
Node.js and OpenSSL headers. On the base alone, npm adds 221 MiB over Node.js. The no-npm image
keeps Python for pip, which npm would bring otherwise, so it is 182 MiB smaller than the code image.

## Untested

- A Node.js or Python process start from a cold page cache. This machine gives no way to empty its
  page cache, so every time here comes from a warm one.
- A code run in an imp, the microVM that runs each nixie sandbox, and an `impz image build` of the
  code image, the step that turns an image into an imp's disk.
- Any program that needs a third-party Python package, and what a pinned set of Python data
  packages, such as numpy and pandas, would add to the image.
- A program near the code tool's wall time, memory or output limits.
