# Spike: the memory and CPU of a small virtual desktop

nixie's browser sandbox runs headless Chromium. This spike measures what it costs to turn that
sandbox into a small virtual desktop that a user can watch: a virtual display, a window manager,
headed Chromium, a terminal and a VNC server.

## Question

How much memory and CPU does the desktop add over headless Chromium, what does watching it cost, and
what is the smallest imp size that holds it?

## Answer

Each figure is the median of 3 repeats in an Ubuntu 24.04 imp with 2 vCPUs and 1024 MiB. "Used"
includes about 165 MiB of bare guest.

| Scenario                                                  | Used MiB | Chromium CPU | Machine CPU |
| --------------------------------------------------------- | -------- | ------------ | ----------- |
| Headless shell, the build nixie ships, on 2 pages         | 467      | 3%           | 1.5%        |
| Desktop, idle                                             | 576      | 3.1%         | 1.6%        |
| Desktop, a page scrolling, a VNC viewer connected         | 653      | 24%          | 24%         |
| Desktop, a page scrolling, a screencast consumer in place | 654      | 57%          | 31%         |

- The desktop adds about 110 MiB over idle headless shell: Xvfb 17 MiB, openbox 11 MiB, xterm 4 MiB
  and x11vnc 14 MiB of proportional memory, plus the memory of full Chromium over headless shell.
- Watching a scrolling page costs about 80 MiB more and up to 24% of the machine's CPU. The Xvfb,
  x11vnc and Chromium processes use most of it.
- The smallest size that held the watched desktop in all 3 runs was 704 MiB. At 640 MiB, 1 of 3 runs
  crashed the harness, with no kernel out-of-memory kill.
- Chromium ran as root with `--no-sandbox`, unlike nixie's guest, so these figures are a floor for
  the memory of the browser processes.

## Run it

Run the commands from the repo root.

1. Create an Ubuntu 24.04 imp, copy this folder into it as `/root/spike`, and run `setup.sh` there.
   Expect: `setup done`.
2. Run a scenario 3 times. The scenarios are `headless-shell`, `headless-full`, `desktop-idle`,
   `desktop-scroll`, `desktop-vnc` and `desktop-cdp`.

   ```bash
   sh /root/spike/sweep.sh <scenario> 3
   ```

   Expect: 3 JSON lines, each with the scenario's memory and CPU figures and the count of
   out-of-memory events.

3. Typecheck with `bun run --cwd research/desktop-memory typecheck`.

## Results

The [results](results.md) hold every figure, the versions, the setup and the method.

## Untested

The spike never ran Chromium with its sandbox on, never tested sizes above 1024 MiB, and never
compared VNC and the screencast at one frame rate. The [untested list](results.md#untested) gives
the rest.
