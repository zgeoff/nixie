# The preview image: a test build of nixie that runs the server from source, so the test sandbox
# runs each guest from the workspace beside it. It holds the whole workspace and its node_modules,
# and is never a release image. Build it from the repository root:
#   docker build -f preview/Dockerfile -t nixie-preview .

FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts \
  && groupadd --gid 10001 nixie \
  && useradd --uid 10001 --gid 10001 --create-home --home-dir /home/nixie --shell /usr/sbin/nologin nixie \
  && mkdir -p /data /var/lib/nixie-preview \
  && chown nixie:nixie /data /var/lib/nixie-preview
USER 10001:10001
VOLUME ["/data", "/var/lib/nixie-preview"]
EXPOSE 8080
ENTRYPOINT ["/app/preview/run-preview.sh"]
CMD ["serve"]
