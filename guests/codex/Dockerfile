# The codex image: Bun, the codex guest's bundle and the Codex CLI's static release binary, and
# nothing of the workspace. The guest runs one Codex turn per command over framed stdin and stdout.
# Build it from the repository root, as docs/runbooks/imp-isolation-tests.md describes:
#   docker build -f guests/codex/Dockerfile -t nixie-codex .
#
#   /app/codex/main.js        the turn entry's bundle
#   /usr/local/bin/codex      the CLI
#
# impd refuses a FROM that names its image with a variable, so each FROM writes out its version,
# and the Bun version equals .bun-version. The CLI version below equals the guest's codexVersion,
# and a change to it reruns the app-server spike's script before the pull request merges.

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile --production --filter @heynixie/codex \
  && bun guests/codex/src/write-guest-bundle.ts --out /out/codex

FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4 AS download
ARG CODEX_VERSION=0.166.0
ADD --checksum=sha256:a0bf572d2f93f056c6712a6da348e96078dc84f3885fd7be67807ef389cb3978 \
  https://github.com/openai/codex/releases/download/rust-v${CODEX_VERSION}/codex-x86_64-unknown-linux-musl.tar.gz \
  /tmp/codex.tar.gz
RUN mkdir /out && tar -xzf /tmp/codex.tar.gz -C /out

FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4
COPY --from=build /out/codex /app/codex
COPY --from=download --chmod=0755 /out/codex-x86_64-unknown-linux-musl /usr/local/bin/codex

# The CLI keeps its sessions under the guest's home, which the sandbox passes as HOME.
RUN useradd --create-home --home-dir /home/nixie --shell /usr/sbin/nologin nixie
USER nixie
WORKDIR /home/nixie
ENV HOME=/home/nixie
CMD ["bun", "--no-install", "/app/codex/main.js"]
