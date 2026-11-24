# The computer image: Bun, a virtual display with a window manager, headed Chromium, a terminal and
# a VNC server, and the computer guest bundled into one file beside Playwright's own package. Build
# it into impd from the repo root. impd refuses a FROM that names its image with a variable, so each
# FROM writes out the Bun version in .bun-version.
#
# xdotool injects the screen tools' pointer and key events, x11-utils (xprop, xwininfo) reads the
# windows, and scrot takes the desktop's picture. The guest runs each as the `screen` account.
#
# ffmpeg and imagemagick (its `magick` command) give the terminal a video and an image editor. They
# come from the distro's packages, whose version the base image's digest fixes, as for every package.
#
# The guest runs as root. It starts the display, the window manager and the VNC server as the
# `screen` account, Chromium as `chrome`, and the terminal and every command as `terminal`. The ids
# below must match desktop-layout.ts, and a test checks that they do.

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts \
  && bun build guests/computer/src/main.ts --target bun --external playwright-core --outfile /out/computer.js \
  && bun build guests/computer/src/shell/bridge-main.ts --target bun --outfile /out/bridge.js \
  && cp -rL guests/computer/node_modules/playwright-core /out/playwright-core

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates python3 jq unzip iproute2 util-linux procps xvfb openbox xterm x11vnc xdotool x11-utils scrot ffmpeg imagemagick \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/playwright-core /app/node_modules/playwright-core
RUN bun /app/node_modules/playwright-core/cli.js install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/* \
  && chmod -R a+rX /opt/browsers
RUN groupadd -g 1001 chrome \
  && useradd -u 1001 -g 1001 -m -d /home/chrome -s /usr/sbin/nologin chrome \
  && groupadd -g 1002 terminal \
  && useradd -u 1002 -g 1002 -M -d /home/computer -s /bin/bash terminal \
  && groupadd -g 1003 screen \
  && useradd -u 1003 -g 1003 -m -d /home/screen -s /usr/sbin/nologin screen \
  && install -d -m 1775 -o root -g terminal /home/computer
RUN chrome="$(find /opt/browsers -path '*/chromium-*' -name chrome -type f | head -n 1)" \
  && test -n "$chrome" \
  && printf '#!/bin/sh\nexec setpriv --reuid=1001 --regid=1001 --clear-groups env HOME=/home/chrome %s "$@"\n' "$chrome" > /usr/local/bin/nixie-chromium \
  && chmod 755 /usr/local/bin/nixie-chromium
COPY --from=build /out/computer.js /app/computer.js
COPY --from=build /out/bridge.js /app/bridge.js
ENTRYPOINT ["/usr/local/bin/bun", "/app/computer.js"]
