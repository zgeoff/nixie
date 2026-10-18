# The conversation image: Bun and the conversation guest, which runs one Agent SDK turn per
# command over framed stdin and stdout. Build it from the repository root:
#   docker build -f guests/conversation/Dockerfile -t nixie-conversation .

FROM oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile --production --filter @heynixie/conversation

# The guest runs from source, so the runtime stage keeps the workspace layout that the isolated
# install's links point into, with the guest and its one workspace dependency.
FROM oven/bun:1.4.3-slim@sha256:14a223fa35747ec728bce300ef85888bc5f7958164d15bbba6a54b22b52a3288
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
