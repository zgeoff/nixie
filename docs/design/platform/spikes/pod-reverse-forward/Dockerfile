# The nixie stand-in: Bun, imp's client and the spike script. The base is pinned by digest.
FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61
WORKDIR /app
COPY package.json bun.lock /app/
RUN bun install --frozen-lockfile --production
COPY nixie.ts /app/nixie.ts
USER bun
CMD ["bun", "nixie.ts"]
