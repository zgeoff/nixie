# The fetch image: a minimal base with Bun and the fetcher bundled into one file. Build it from the
# repo root: docker build -f guests/fetch/Dockerfile -t nixie-fetch .
ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION}-slim AS build
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts \
  && bun build guests/fetch/src/main.ts --target bun --outfile /out/fetch.js

FROM oven/bun:${BUN_VERSION}-slim
COPY --from=build /out/fetch.js /app/fetch.js
USER bun
ENTRYPOINT ["/usr/local/bin/bun", "/app/fetch.js"]
