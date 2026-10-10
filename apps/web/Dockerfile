# The web image: the TanStack Start server and its built assets, with no secrets, database or
# credentials. Build it from the repository root:
#   docker build -f apps/web/Dockerfile -t nixie-web .

FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile \
  && bun run --cwd apps/web build

# The server build bundles every dependency, so the runtime stage holds Bun and dist/ only.
FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61
WORKDIR /app
ENV NODE_ENV=production \
  PORT=3000
COPY --from=build /repo/apps/web/dist ./dist
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD ["bun", "-e", "const live = await fetch(`http://127.0.0.1:${process.env.PORT}/health/live`); process.exit(live.ok ? 0 : 1);"]

# NIXIE_API_URL, the private URL of nixie's API, comes from the deployment.
CMD ["bun", "dist/server/server.js"]
