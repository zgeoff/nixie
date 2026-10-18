# The spike image: the fetch image's base with Debian's Chromium and the spike's scripts. Build it
# from the repo root, because the proxy imports the fetcher's hop planner from guests/fetch:
#   docker build -f research/fetch-headless/Dockerfile -t fetch-headless:full .
#   docker build -f research/fetch-headless/Dockerfile -t fetch-headless:shell \
#     --build-arg ENGINE=chromium-headless-shell .
FROM oven/bun:1.4.3-slim
# chromium for the full browser, or chromium-headless-shell for the headless-only build
ARG ENGINE=chromium
RUN apt-get update \
  && apt-get install -y --no-install-recommends $ENGINE iproute2 \
  && rm -rf /var/lib/apt/lists/*
COPY research/fetch-headless/chromium-policy.json /etc/chromium/policies/managed/fetch.json
WORKDIR /repo
COPY guests/fetch/src guests/fetch/src
COPY research/fetch-headless/package.json research/fetch-headless/bun.lock research/fetch-headless/
WORKDIR /repo/research/fetch-headless
RUN bun install --frozen-lockfile --ignore-scripts
COPY research/fetch-headless/*.ts ./
USER bun
ENTRYPOINT ["/usr/local/bin/bun"]
