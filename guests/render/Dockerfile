# The render image: Bun, headless Chromium and the render guest bundled into one file beside
# Playwright's own package. The guest opens the layout files that the server sends as a page, takes
# its picture and exits, and the sandbox that runs it has no network. Build it into impd from the
# repo root. impd refuses a FROM that names its image with a variable, so each FROM writes out the
# Bun version in .bun-version.
#
# Only the headless shell is installed, because the guest never opens a window. Like every apt
# package that --with-deps installs, its fonts have no version pin: each build installs what the
# distro's mirror holds then, and the image's size budget catches a build that grows.

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts \
  && bun build guests/render/src/main.ts --target bun --external playwright-core --outfile /out/render.js \
  && cp -rL guests/render/node_modules/playwright-core /out/playwright-core

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
COPY --from=build /out/playwright-core /app/node_modules/playwright-core
RUN apt-get update \
  && bun /app/node_modules/playwright-core/cli.js install --with-deps chromium-headless-shell \
  && rm -rf /var/lib/apt/lists/* \
  && chmod -R a+rX /opt/browsers
COPY --from=build /out/render.js /app/render.js
USER bun
ENTRYPOINT ["/usr/local/bin/bun", "/app/render.js"]
