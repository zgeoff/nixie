# The stand-in nixie image: Bun, the app, and the sops and restic binaries it runs itself. Every
# base is pinned by digest, as the deployment pins this image.
FROM ghcr.io/getsops/sops:v3.13.3-alpine@sha256:ae501277bf742f1662e0f881f43dd8fd6798b489a8058e921dbf6cda597140ea AS sops
FROM restic/restic:0.19.1@sha256:136600b6ff6843d61d355f7f71f460a166429f35de6fd11b568fece3c9a4d510 AS restic

FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61
ARG NIXIE_BUILD=1
ENV NIXIE_BUILD=${NIXIE_BUILD}
COPY --from=sops /usr/local/bin/sops /usr/local/bin/sops
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
WORKDIR /app
COPY app.ts /app/app.ts
CMD ["bun", "app.ts", "serve"]
