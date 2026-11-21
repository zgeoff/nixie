# The shell image: a small base with Bun and common command-line tools, and the shell guest bundled
# into one file. Build it into impd from the repo root. impd refuses a FROM that names its image
# with a variable, so each FROM writes out the Bun version in .bun-version.

FROM oven/bun:1.4.4-slim AS build
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts \
  && bun build guests/shell/src/main.ts --target bun --outfile /out/shell.js \
  && bun build guests/shell/src/shell/bridge-main.ts --target bun --outfile /out/bridge.js

FROM oven/bun:1.4.4
RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates python3 jq unzip iproute2 util-linux \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/shell.js /app/shell.js
COPY --from=build /out/bridge.js /app/bridge.js
USER bun
ENTRYPOINT ["/usr/local/bin/bun", "/app/shell.js"]
