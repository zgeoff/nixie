# The web image: the TanStack Start server and its built assets, with no secrets, database or
# credentials. Build it from the repository root:
#   docker build -f apps/web/Dockerfile -t nixie-web .

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
WORKDIR /repo
COPY . .
# the blob id of each source file the image is built from, before the install adds generated code,
# so the verify CLI's preview doctor can tell which commit a running web container serves
RUN bun preview/write-source-blobs.ts /repo > /repo/source-blobs.txt \
  && bun install --frozen-lockfile \
  && bun run --cwd apps/web build

# The server build bundles every dependency, so the runtime stage holds Bun, dist/ and the source
# list only.
FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4
WORKDIR /app
ENV NODE_ENV=production \
  PORT=3000
COPY --from=build /repo/apps/web/dist ./dist
COPY --from=build /repo/source-blobs.txt ./source-blobs.txt
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD ["bun", "-e", "const live = await fetch(`http://127.0.0.1:${process.env.PORT}/health/live`); process.exit(live.ok ? 0 : 1);"]

# NIXIE_API_URL, the private URL of nixie's API, comes from the deployment.
CMD ["bun", "dist/server/server.js"]
