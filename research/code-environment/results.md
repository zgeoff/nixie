# Spike results: the code environment

The [sandbox adapter design](../../docs/design/platform/connectors/sandbox-adapter.md#images) lists
2 images that run code. The code image is the sandbox for a code run from the conversation or a
task: Debian with Node.js, Python and a toolbox of jq, ripgrep, grep and the common Linux file and
text tools. The worker image is the conversation image, which holds Bun and Claude Code for a model
turn, plus the same runtimes and toolbox, because a worker runs its code in its own sandbox. This
spike runs the same report program in Node.js, Python and shell in both images, probes what each
image holds and refuses, and measures each image's size.

All 3 programs ran in both images, under the code tool's limits. Python holds only its standard
library, and Node.js loads the 869 libraries that Debian's npm package installs, such as lodash. A
code run cannot install a package, because it has no network. The code image holds 453 MiB of files,
and npm brings 182 MiB of them.

## Question

1. Do the code and worker images run representative Node.js, Python and shell programs?
2. How large is each image?

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

[`run.sh`](run.sh) builds these images:

- the code image, from [`Dockerfile`](Dockerfile), which runs as an unprivileged user and holds no
  Bun or Claude Code;
- the conversation image, from the conversation guest's own Dockerfile in the same checkout;
- the worker image, from the worker cold start spike's
  [`Dockerfile`](../worker-cold-start/Dockerfile) with `RUNTIMES=yes`, on that conversation image;
- 6 size images from [`Dockerfile.size`](Dockerfile.size). Each one installs a single package group
  on the code image's Debian base, so each group's size shows apart from the others.

The no-npm size image installs the code image's packages less npm. It runs the programs too, so it
shows whether the code image needs npm.

[`bench.ts`](bench.ts) runs each program 5 times in each of the code, worker and no-npm images, and
reverses the order of the images on every second sample. Then it runs each probe once in each of
those images. Each code run is a new container under the code tool's default limits from the
[coding design](../../docs/design/platform/connectors/coding.md#the-code-tool): no network, 1 vCPU,
1 GiB of memory and no swap. The programs and their input are mounted read-only, and each program
writes its files to a tmpfs.

Each program reads the same 20 invented orders from [`orders.csv`](programs/orders.csv) and prints
the order count, units, revenue and top item per region as one JSON line. A code run counts as right
when it exits 0 and its line equals [`expected.json`](programs/expected.json). Each program also
uses more of its language's standard library:

- [`report.mjs`](programs/report.mjs) writes the report through `node:zlib` and checks the round
  trip, and writes a `node:crypto` digest;
- [`report.py`](programs/report.py) loads the orders into `sqlite3`, groups them in SQL, takes a
  `statistics` median, and zips the report with `zipfile`;
- [`report.sh`](programs/report.sh) checks the input with `file` and ripgrep, sums it with awk and
  sort, and builds the report with jq.

[`summarize.ts`](summarize.ts) prints the median and the 90th percentile (nearest rank) of each
cell. The [`results`](results/) folder holds every code run's line, the image sizes and the summary.

## Answer

### 1. Representative programs

Each cell holds 5 code runs. The total time counts from before `docker run` to the container's exit.
The program time counts inside the container, from the program's start to its exit. All times are in
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

Docker's own container start takes most of each total. The program time includes the runtime's own
start: the start probes, `node -e 0` and `python3 -c pass`, took 50 to 60 ms and 8 to 9 ms in every
image.

Each probe gives the same outcome in the code and worker images:

| Probe                                                                                    | Outcome                                                   |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `node:zlib`, `node:crypto`, `node:worker_threads`, `node:child_process`                  | load                                                      |
| `node:sqlite`                                                                            | fails: Node.js 20 has no `node:sqlite`                    |
| Python's `csv`, `decimal`, `hashlib`, `json`, `sqlite3`, `statistics`, `zipfile`, `venv` | import                                                    |
| Python's `numpy`, `pandas`, `requests`                                                   | fail with `ModuleNotFoundError`                           |
| Node.js `require('lodash')`                                                              | loads, from `/usr/share/nodejs`, which Debian's npm fills |
| `npm --version`                                                                          | prints 9.2.0                                              |
| `pip install --user requests`                                                            | refused: the system Python is externally managed          |
| `pip install requests` in a new venv                                                     | fails: no version found, with no network                  |
| `npm install lodash`                                                                     | fails with no network                                     |
| `curl https://example.com/`                                                              | fails: the host name does not resolve                     |

The code image holds 896 Node.js libraries in `/usr/share/nodejs`, and Node.js resolves a `require`
there. Debian's npm package brings 869 of them, such as lodash, chalk, glob, semver and yargs, and
the `nodejs` package brings the other 27. In the no-npm image, `require('lodash')` fails, and
`npm --version` and `npm install` both fail with `npm: command not found`. Every other probe gives
the same outcome there.

So the code and worker images run a program that uses its language's standard library, the toolbox,
or one of the Node.js libraries that npm brings. A Python program that imports a third-party package
fails, and the model cannot install one in a code run.

Both images get Node.js 20.19.2 from Debian 13. Node.js 20 reached the end of its upstream support
on 2026-04-30, by the
[Node.js release schedule](https://github.com/nodejs/Release/blob/main/schedule.json), so a
supported Node.js needs a source other than Debian 13's own package.

### 2. Image sizes

The table counts each image 3 ways:

- **Files** counts every file in the image's root with `du`, in MiB. It is the size of the image
  unpacked.
- **Pull** counts the compressed layers that a registry stores and a host pulls, in MB.
- **Docker disk** is the size that `docker images` prints, which the worker cold start spike
  recorded. On the containerd image store, it counts both the unpacked files and the compressed
  layers.

| Image        | Files (MiB) | Pull (MB) | Docker disk | Debian packages |
| ------------ | ----------: | --------: | ----------: | --------------: |
| Debian base  |          84 |        30 |      120 MB |              78 |
| code         |         453 |       115 |      591 MB |             499 |
| code, no npm |         271 |        94 |      380 MB |             149 |
| conversation |         781 |       344 |     1.16 GB |              80 |
| worker       |        1147 |       428 |     1.64 GB |             499 |

The worker image's runtimes and toolbox add 366 MiB of files and 84 MB of pull to the conversation
image, and 480 MB of Docker disk. The worker cold start spike recorded the same 480 MB gap, on a
conversation image of 1.03 GB with Agent SDK 0.3.290.

Each package group on the Debian base alone:

| Group          | Packages                           | Files (MiB) | Over the base (MiB) |
| -------------- | ---------------------------------- | ----------: | ------------------: |
| node           | `nodejs`                           |         185 |                 101 |
| node and npm   | `nodejs npm`                       |         406 |                 322 |
| python         | `python3`                          |         120 |                  36 |
| python and pip | `python3 python3-pip python3-venv` |         138 |                  54 |
| toolbox        | the toolbox's 12 packages          |         120 |                  36 |

npm brings 350 of the code image's 499 Debian packages, among them `node-gyp`, Python and the
Node.js and OpenSSL headers. On the base alone, npm adds 221 MiB over Node.js. In the code image,
dropping npm saves only 182 MiB, because Python comes in with pip as well. A code run has no
network, so npm can install nothing there, and the 3 programs run the same without it.

## Untested

- A Node.js or Python process start from a cold page cache. This machine gives no way to empty its
  page cache, so every time here comes from a warm one.
- A code run in an imp, the microVM that runs each nixie sandbox, and an `impz image build` of the
  code image, the step that turns an image into an imp's disk.
- Any program that needs a third-party Python package, and what a pinned set of Python data
  packages, such as numpy and pandas, would add to the image.
- A program near the code tool's wall time, memory or output limits.
