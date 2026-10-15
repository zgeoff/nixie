# The spike image: the fetch image's base with Debian's Chromium and the spike's scripts. Build it
# from the repo root, because the proxy imports the fetcher's hop planner from guests/fetch:
#   docker build -f docs/design/platform/spikes/fetch-headless/Dockerfile -t fetch-headless:full .
#   docker build -f docs/design/platform/spikes/fetch-headless/Dockerfile -t fetch-headless:shell \
#     --build-arg ENGINE=chromium-headless-shell .
FROM oven/bun:1.4.2-slim
# chromium for the full browser, or chromium-headless-shell for the headless-only build
ARG ENGINE=chromium
RUN apt-get update \
  && apt-get install -y --no-install-recommends $ENGINE iproute2 \
  && rm -rf /var/lib/apt/lists/*
COPY docs/design/platform/spikes/fetch-headless/chromium-policy.json /etc/chromium/policies/managed/fetch.json
WORKDIR /repo
COPY guests/fetch/src guests/fetch/src
COPY docs/design/platform/spikes/fetch-headless/package.json docs/design/platform/spikes/fetch-headless/bun.lock docs/design/platform/spikes/fetch-headless/
WORKDIR /repo/docs/design/platform/spikes/fetch-headless
RUN bun install --frozen-lockfile --ignore-scripts
COPY docs/design/platform/spikes/fetch-headless/*.ts ./
USER bun
ENTRYPOINT ["/usr/local/bin/bun"]
