# Spike results: the memory and CPU of a small virtual desktop

These are the figures behind the answer in the [README](README.md#answer).

## Question

1. How much memory and CPU does a virtual desktop add to the headless Chromium sandbox?
2. What does watching the desktop cost, over VNC and over a Chromium screencast?
3. What is the smallest imp memory size that holds the watched desktop?

## Setup

| Component       | Version                                            |
| --------------- | -------------------------------------------------- |
| Guest OS        | Ubuntu 24.04.5, 2 vCPUs, 1024 MiB                  |
| Xvfb            | 2:21.1.12-1ubuntu1.9                               |
| x11vnc          | 0.9.16-10                                          |
| openbox         | 3.6.1-12build5                                     |
| xterm           | 390-1ubuntu3                                       |
| VNC viewer      | tigervnc-viewer                                    |
| Bun             | 1.4.4                                              |
| playwright-core | 1.65.1                                             |
| Chromium        | Playwright build 1255; headless shell 159.0.8154.6 |

Ubuntu's `chromium` apt package installs only a snap, so the spike used Playwright's Chromium
builds.

[`setup.sh`](setup.sh) installs the packages in a fresh imp. [`run.ts`](run.ts) runs one scenario
and prints one JSON line. [`sweep.sh`](sweep.sh) runs a scenario several times, drops the file cache
before each run and counts out-of-memory events in the kernel log.

Method of `run.ts`:

1. For a desktop scenario, start Xvfb at 1280x800, openbox and an xterm that prints the date every 5
   seconds.
2. Launch Chromium with `--no-sandbox`, open example.com and the BBC News front page, and bring the
   news page to the front.
3. Start the scenario's load. Scrolling scenarios send a mouse wheel event every 60 ms.
   `desktop-vnc` starts x11vnc and a viewer on a second display, so the viewer's cost is separate.
   `desktop-cdp` starts a Chromium screencast and acknowledges each frame.
4. Wait 25 seconds. Then sample for 30 seconds, reading `/proc` for the memory and CPU time of each
   process, and `/proc/meminfo` every 2 seconds.

Each run reports these figures:

- "Used" is `MemTotal` less `MemAvailable`. It includes about 165 MiB of bare guest.
- RSS and PSS are the resident and the proportional memory of Chromium's processes. PSS divides each
  shared page among the processes that map it, so it counts the memory once.
- CPU is a percentage of one core, from each process's CPU time over the window. Machine CPU is the
  busy share of both vCPUs.

Chromium ran as root with `--no-sandbox` and `--disable-dev-shm-usage`, unlike nixie's guest.

## Scenarios

Medians of 3 repeats.

| Scenario                                                               | Used MiB                         | Chromium RSS / PSS MiB | CPU                                                         |
| ---------------------------------------------------------------------- | -------------------------------- | ---------------------- | ----------------------------------------------------------- |
| 1a headless shell (nixie's build), example.com and bbc.com/news        | 467                              | 661 / 334              | Chromium 3%, machine 1.5%                                   |
| 1b headless full Chromium, same pages                                  | 553                              | 1211 / 477             | Chromium 2.8%                                               |
| 2 desktop idle: Xvfb, openbox, headed Chromium, xterm                  | 576                              | 1289 / 540             | Chromium 3.1%, machine 1.6%                                 |
| 3 desktop watched: x11vnc and a viewer, page scrolling                 | 653, or about 610 without viewer | 1343 / 571             | x11vnc 10%, Xvfb 7%, Chromium 24%, viewer 4.5%, machine 24% |
| 3c page scrolling, a screencast consumer at about 32 frames per second | 654                              | 1383 / 605             | Chromium 57%, machine 31%                                   |
| 3d page scrolling, nobody watching, an unthrottled scroll loop         | 983                              | 1220 / 703             | Chromium 51%, machine 90%                                   |

The harness's `bun` process held 85 MiB in every row.

Scenario 3d is the worst case: with nobody watching, the loop scrolled as fast as Chromium would
take events, and the machine reached 90% busy. Its 983 MiB of used memory is mostly page cache that
the run filled, so it is not a steady figure.

### Memory of each extra process

| Process | PSS MiB |
| ------- | ------- |
| Xvfb    | 17      |
| openbox | 11      |
| xterm   | 4       |
| x11vnc  | 14      |

- The desktop extras add about 110 MiB over idle headless shell. Full headless Chromium costs about
  86 MiB more than headless shell, and a headed window adds a little more.
- The screencast consumer cost more Chromium CPU than x11vnc did, at a different frame rate, so that
  comparison is indicative only.

## Size sweep

Scenario 3 with the imp's memory cut in steps of 64 MiB, 3 runs each.

| Size MiB | Result                                              | Used MiB  | Machine CPU |
| -------- | --------------------------------------------------- | --------- | ----------- |
| 1024     | held                                                | about 650 |             |
| 768      | held                                                | 619       | 26%         |
| 704      | held in 3 of 3 runs                                 | 603       | 36%         |
| 640      | 1 of 3 runs crashed the harness, no kernel OOM kill |           |             |

The smallest size that held was 704 MiB. The 640 MiB crash left no out-of-memory line in the kernel
log, so the cause is unknown.

## Untested

- Chromium with its sandbox on, as nixie's guest runs it.
- Sizes above 1024 MiB, because the test host could not create them.
- VNC and the screencast at the same frame rate.
- A real viewer over a network, with its encoding and bandwidth cost.
- Several pages scrolling at once, video, and a long-lived desktop with window churn.
- A desktop with a larger display than 1280x800.
