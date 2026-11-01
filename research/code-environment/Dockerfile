# The code image: a Debian base with Node.js, Python and the toolbox that the sandbox adapter design
# lists, and no Bun or Claude Code. Its base is the Debian release under oven/bun:1.4.3-slim, so the
# code image and the worker image install the same runtime versions.
FROM debian:trixie-slim@sha256:f6b08b09a05725f9431502d3b5714f5c4576e82c1a84fa1debe0c24a7e0c3ec4

# NPM= builds the no-npm image, which keeps everything else.
ARG NPM=npm
RUN apt-get update \
  && apt-get install -y --no-install-recommends nodejs ${NPM} python3 python3-pip python3-venv \
    jq ripgrep file less procps findutils gawk sed grep coreutils ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --home-dir /home/code --shell /bin/bash code
USER code
WORKDIR /home/code
ENV HOME=/home/code
