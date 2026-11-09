# The nixie image: Bun on a slim base, the server and its SQLite worker bundled with bun build, the sandbox
# manifest, the sops binary, and the memory encoder's pinned model files with the ONNX Runtime package
# the bundle leaves external. It holds no Claude Code build, no other node_modules and no backup
# tools, and runs as a non-root user on a read-only root filesystem, with /data its one writable mount.
# The nixie command on the PATH runs the server's commands.
# Build it from the repository root, with the release workflow's sandbox manifest at
# apps/server/sandbox-manifest.json:
#   docker build -f apps/server/Dockerfile -t nixie .

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
WORKDIR /repo
COPY . .

# the release build exits 1 when the bundle holds a fault point ID, the test rule's ID or the test
# sandbox
RUN bun install --frozen-lockfile --ignore-scripts \
  && bun apps/server/src/run-release-build.ts /out/app

# each pinned binary, checked against the checksum the repo recorded, never one fetched with it;
# a release download can answer HTTP 504 for a while, so each download tries 4 times
RUN mkdir -p /out/bin \
  && grep -v '^#' apps/server/binaries.txt | while read -r name version url sum; do \
    for attempt in 1 2 3 4; do \
      URL="$url" OUT="/out/bin/$name" bun -e 'const response = await fetch(process.env.URL); if (!response.ok) throw new Error(`${process.env.URL} answered HTTP ${response.status}`); await Bun.write(process.env.OUT, response)' \
        && break; \
      [ "$attempt" -lt 4 ] && sleep $((attempt * 10)) || exit 1; \
    done \
    && echo "$sum  /out/bin/$name" | sha256sum -c - \
    && chmod 0755 "/out/bin/$name" \
    || exit 1; \
  done

# the encoder's model files at a fixed revision, each checked against the checksum the repo
# recorded; the download exits 1 on a file that differs, which fails the build
RUN bun adapters/encoder-onnx/src/run-pinned-download.ts adapters/encoder-onnx/model-files.txt /out/encoder

# a bundle cannot inline a native addon, so onnxruntime-node sits beside it with its linux-x64
# binary alone, and onnxruntime-common, the one package it loads
RUN ORT=$(echo node_modules/.bun/onnxruntime-node@*/node_modules/onnxruntime-node) \
  && COMMON=$(echo node_modules/.bun/onnxruntime-common@*/node_modules/onnxruntime-common) \
  && mkdir -p /out/app/node_modules/onnxruntime-node/bin/napi-v6/linux /out/app/node_modules/onnxruntime-common \
  && cp -r "$ORT/package.json" "$ORT/dist" /out/app/node_modules/onnxruntime-node/ \
  && cp -r "$ORT/bin/napi-v6/linux/x64" /out/app/node_modules/onnxruntime-node/bin/napi-v6/linux/ \
  && cp -r "$COMMON/package.json" "$COMMON/dist" /out/app/node_modules/onnxruntime-common/

FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4
COPY --from=build /out/bin/sops /usr/local/bin/sops
COPY --from=build /out/app/ /app/
COPY --from=build /out/encoder/ /app/encoder/
COPY apps/server/sandbox-manifest.json /app/sandbox-manifest.json

# nixie on the PATH runs a command by its name, so a deployment's scripts call nixie health or nixie
# enrol-code and never name a file in /app
RUN printf '#!/bin/sh\nexec bun /app/main.js "$@"\n' > /usr/local/bin/nixie \
  && chmod 0755 /usr/local/bin/nixie
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
