# The fetch image: a minimal base with Bun and the fetcher bundled into one file. Build it into impd
# from the repo root, as docs/runbooks/imp-isolation-tests.md describes. impd refuses
# a FROM that names its image with a variable, so each FROM writes out the Bun version in
# .bun-version.

FROM oven/bun:1.4.2-slim AS build
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts \
  && bun build guests/fetch/src/main.ts --target bun --outfile /out/fetch.js

FROM oven/bun:1.4.2-slim
COPY --from=build /out/fetch.js /app/fetch.js
USER bun
ENTRYPOINT ["/usr/local/bin/bun", "/app/fetch.js"]
