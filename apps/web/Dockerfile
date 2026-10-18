# The web image: the TanStack Start server and its built assets, with no secrets, database or
# credentials. Build it from the repository root:
#   docker build -f apps/web/Dockerfile -t nixie-web .

FROM oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile \
  && bun run --cwd apps/web build

# The server build bundles every dependency, so the runtime stage holds Bun and dist/ only.
FROM oven/bun:1.4.3-slim@sha256:14a223fa35747ec728bce300ef85888bc5f7958164d15bbba6a54b22b52a3288
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
