# The conversation image: Bun, the conversation guest's 2 bundles and the Agent SDK's CLI, and
# nothing of the workspace. The guest runs one Agent SDK turn per command over framed stdin and
# stdout. Build it from the repository root:
#   docker build -f guests/conversation/Dockerfile -t nixie-conversation .
#
#   /app/conversation/main.js    the turn entry's bundle
#   /app/conversation/check.js   the check entry's bundle
#   /app/claude                  the CLI

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile --production --filter @heynixie/conversation

# The runtime base is Debian, so the CLI is the glibc one. The bundles name the CLI's path in the
# image, and the glob must match exactly one file.
RUN set -eu \
  && mkdir -p /out/conversation \
  && bun guests/conversation/src/write-guest-bundles.ts --out /out/conversation --cli-path /app/claude \
  && set -- node_modules/.bun/@anthropic-ai+claude-agent-sdk-linux-x64@*/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude \
  && [ "$#" -eq 1 ] && [ -f "$1" ] \
  && cp "$1" /out/claude

FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4
COPY --from=build /out/conversation /app/conversation
COPY --from=build --chmod=0755 /out/claude /app/claude

# The SDK keeps its sessions under the guest's home, which the sandbox passes as HOME.
RUN useradd --create-home --home-dir /home/nixie --shell /usr/sbin/nologin nixie
USER nixie
WORKDIR /home/nixie
ENV HOME=/home/nixie
CMD ["bun", "/app/conversation/main.js"]
