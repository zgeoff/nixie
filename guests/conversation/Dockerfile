# The conversation image: Bun and the conversation guest, which runs one Agent SDK turn per
# command over framed stdin and stdout. Build it from the repository root:
#   docker build -f guests/conversation/Dockerfile -t nixie-conversation .

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile --production --filter @heynixie/conversation

# The guest runs from source, so the runtime stage keeps the workspace layout that the isolated
# install's links point into, with the guest and its one workspace dependency.
FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4
COPY --from=build /repo/package.json /app/package.json
COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/libs/wire /app/libs/wire
COPY --from=build /repo/guests/conversation /app/guests/conversation

# The SDK keeps its sessions under the guest's home, which the sandbox passes as HOME.
RUN useradd --create-home --home-dir /home/nixie --shell /usr/sbin/nologin nixie
USER nixie
WORKDIR /home/nixie
ENV HOME=/home/nixie
CMD ["bun", "/app/guests/conversation/src/main.ts"]
