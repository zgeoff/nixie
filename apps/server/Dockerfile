# The nixie image: Bun on a slim base, the server and its SQLite worker bundled with bun build, the sandbox
# manifest and the sops binary. It holds no Claude Code build, no node_modules and no backup tools,
# and runs as a non-root user on a read-only root filesystem, with /data its one writable mount.
# Build it from the repository root, with the release workflow's sandbox manifest at
# apps/server/sandbox-manifest.json:
#   docker build -f apps/server/Dockerfile -t nixie .

FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS build
WORKDIR /repo
COPY . .

# the release build exits 1 when the bundle holds a fault point ID, the test rule's ID or the test
# sandbox
RUN bun install --frozen-lockfile --ignore-scripts \
  && bun apps/server/src/run-release-build.ts /out/app

# each pinned binary, checked against the checksum the repo recorded, never one fetched with it
RUN mkdir -p /out/bin \
  && grep -v '^#' apps/server/binaries.txt | while read -r name version url sum; do \
    URL="$url" OUT="/out/bin/$name" bun -e 'await Bun.write(process.env.OUT, await fetch(process.env.URL))' \
    && echo "$sum  /out/bin/$name" | sha256sum -c - \
    && chmod 0755 "/out/bin/$name" \
    || exit 1; \
  done

FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61
COPY --from=build /out/bin/sops /usr/local/bin/sops
COPY --from=build /out/app/ /app/
COPY apps/server/sandbox-manifest.json /app/sandbox-manifest.json
RUN groupadd --gid 10001 nixie \
  && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin nixie
USER 10001:10001
WORKDIR /app
VOLUME /data
EXPOSE 8080

# readiness, which Compose's up --wait reads; Kubernetes probes /health/live and /health/ready
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD ["bun", "/app/main.js", "health"]
ENTRYPOINT ["bun", "/app/main.js"]
CMD ["serve"]
