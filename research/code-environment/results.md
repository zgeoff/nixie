# Spike results: the code environment

This spike builds the code image from Debian 13 with Node.js, Python and the toolbox that the
[sandbox adapter design](../../docs/design/platform/connectors/sandbox-adapter.md#images) lists, and
rebuilds the worker image from the [worker cold start spike](../worker-cold-start/README.md). It
runs the same report program in Node.js, Python and shell in both images under the code tool's
limits, probes what each image holds and refuses, and sizes each image and each package group.

Both images run all 3 programs, with only each language's standard library and the toolbox. Neither
image holds a third-party package, and a code run cannot install one, because it has no network. The
code image holds 453 MiB of files, and npm makes up 182 MiB of them.

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
| Worker image | the conversation image at this commit, plus the code runtimes                                  |
| Docker       | 29.7.2, overlayfs on the containerd image store                                                |
| Machine      | Linux 6.6, 16 vCPUs, 30 GiB                                                                    |

[`run.sh`](run.sh) builds these images:

- the code image, from [`Dockerfile`](Dockerfile), which runs as an unprivileged user and holds no
  Bun or Claude Code;
- the worker image, from the conversation guest's own Dockerfile and the worker cold start spike's
  [`Dockerfile`](../worker-cold-start/Dockerfile) with `RUNTIMES=yes`;
- one size image per package group, from [`Dockerfile.size`](Dockerfile.size), each on the code
  image's base with only that group. The `no-npm` group is the code image's packages less npm, and
  it runs the programs too.

[`bench.ts`](bench.ts) runs each program 5 times in each image, alternating the image that goes
first, then each probe once. Every run is a new container with the code tool's default limits from
the [coding design](../../docs/design/platform/connectors/coding.md#the-code-tool): no network, 1
vCPU, 1 GiB and no swap. The programs and their input are mounted read-only, and each program writes
its files to a tmpfs.

Each program reads the same 20 invented orders from [`orders.csv`](programs/orders.csv) and prints
the order count, units, revenue and top item per region as one JSON line. A run counts as right when
it exits 0 and its line equals [`expected.json`](programs/expected.json). Each program also
exercises its language's standard library:

- [`report.mjs`](programs/report.mjs) writes the report through `node:zlib` and checks the round
  trip, and writes a `node:crypto` digest;
- [`report.py`](programs/report.py) loads the orders into `sqlite3`, groups them in SQL, takes a
  `statistics` median, and zips the report with `zipfile`;
- [`report.sh`](programs/report.sh) checks the input with `file` and ripgrep, sums it with awk and
  sort, and builds the report with jq.

[`summarize.ts`](summarize.ts) prints the median and the 90th percentile (nearest rank) of each
cell. The [`results`](results/) folder holds every run line, the image sizes and the summary.

## Answer

### 1. Representative programs

Each cell holds 5 runs. A run's time counts from before `docker run` to its exit, and a program's
time counts inside the container, from the program's start to its exit. All times are in
milliseconds, from a warm page cache.

| Image  | Program | Right | Run median | Run p90 | Program median | Program p90 |
| ------ | ------- | ----: | ---------: | ------: | -------------: | ----------: |
| code   | node    |   5/5 |        388 |     459 |             76 |          82 |
| code   | python  |   5/5 |        339 |     405 |             22 |          23 |
| code   | shell   |   5/5 |        299 |     378 |              8 |           9 |
| worker | node    |   5/5 |        402 |     452 |             77 |          85 |
| worker | python  |   5/5 |        338 |     399 |             23 |          26 |
| worker | shell   |   5/5 |        330 |     392 |              9 |          12 |
| no-npm | node    |   5/5 |        433 |     517 |             74 |          79 |
| no-npm | python  |   5/5 |        376 |     451 |             22 |          24 |
| no-npm | shell   |   5/5 |        360 |     396 |              8 |           8 |

Docker's own start takes most of each run. From a warm page cache, `node -e 0` takes 50 to 60 ms and
`python3 -c pass` 8 to 9 ms in every image.

The probes give the same outcome in the code and worker images:

| Probe                                                                                    | Outcome                                           |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `node:zlib`, `node:crypto`, `node:worker_threads`, `node:child_process`                  | load                                              |
| `node:sqlite`                                                                            | fails: Node.js 20 has no `node:sqlite`            |
| Python's `csv`, `decimal`, `hashlib`, `json`, `sqlite3`, `statistics`, `zipfile`, `venv` | import                                            |
| Python's `numpy`, `pandas`, `requests`                                                   | fail with `ModuleNotFoundError`                   |
| Node.js `require('lodash')`                                                              | loads, from the Debian packages that npm pulls in |
| `pip install --user requests`                                                            | refused: the system Python is externally managed  |
| `pip install requests` in a new venv                                                     | fails: no version found, with no network          |
| `npm install lodash`                                                                     | fails with no network                             |
| `curl https://example.com/`                                                              | fails: the host name does not resolve             |

In the no-npm image, `require('lodash')` fails and both npm probes fail with
`npm: command not found`. Every other probe gives the same outcome there.

So the contents in the design are enough for a program that uses only its language's standard
library and the toolbox. A program that imports a third-party package fails, and a model has no way
to install one in a code run.

Both images get Node.js 20.19.2 from Debian 13. Node.js 20 reached the end of its upstream support
on 2026-04-30, by the
[Node.js release schedule](https://github.com/nodejs/Release/blob/main/schedule.json).

### 2. Image sizes

Files counts every file in the image's root, by `du`. Pull counts the compressed layers that a
registry stores and a host pulls. Docker disk counts what `docker images` prints, the figure the
worker cold start spike recorded: on the containerd image store it holds both the unpacked files and
the compressed layers.

| Image        | Files (MiB) | Pull (MB) | Docker disk | Debian packages |
| ------------ | ----------: | --------: | ----------: | --------------: |
| Debian base  |          84 |        30 |      120 MB |              78 |
| code         |         453 |       115 |      591 MB |             499 |
| code, no npm |         271 |        94 |      380 MB |             149 |
| conversation |         781 |       344 |     1.16 GB |              80 |
| worker       |        1147 |       428 |     1.64 GB |             499 |

The code runtimes add 366 MiB of files and 84 MB of pull to the conversation image. Docker counts
480 MB more on disk, the same gap the worker cold start spike recorded, though both images have
grown by 130 MB since that spike ran.

Each package group on the Debian base alone:

| Group          | Packages                           | Files (MiB) | Over the base (MiB) |
| -------------- | ---------------------------------- | ----------: | ------------------: |
| node           | `nodejs`                           |         185 |                 101 |
| node and npm   | `nodejs npm`                       |         406 |                 322 |
| python         | `python3`                          |         120 |                  36 |
| python and pip | `python3 python3-pip python3-venv` |         138 |                  54 |
| toolbox        | the toolbox's 12 packages          |         120 |                  36 |

npm brings 350 of the code image's 499 Debian packages, among them `node-gyp`, Python and the
Node.js and OpenSSL headers. On the base alone, npm adds 221 MiB over Node.js, more than Node.js,
Python with pip and the toolbox add together. A code run has no network, so npm can install nothing
there, and the programs run the same without it.

## Untested

- A Node.js or Python start from a cold page cache. This machine gives no way to empty its page
  cache, so every time here comes from a warm one.
- A run in a real imp, or an `impz image build` of the code image.
- Any program that needs a third-party package, and what a pinned set of Python data packages, such
  as numpy and pandas, would add to the image.
- A program near the code tool's wall time, memory or output limits.
