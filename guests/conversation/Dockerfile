# The conversation image: Bun and the conversation guest, which runs one Agent SDK turn per
# command over framed stdin and stdout. Build it from the repository root:
#   docker build -f guests/conversation/Dockerfile -t nixie-conversation .

FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile --production --filter @heynixie/conversation

# The guest runs from source, so the runtime stage keeps the workspace layout that the isolated
# install's links point into, with the guest and its one workspace dependency.
FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61
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
