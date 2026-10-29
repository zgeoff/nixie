# The nixie-backup image: the backup job bundled with bun build on a slim Bun base, and the restic
# binary at the version and checksum that binaries.txt pins. It opens no database and holds no
# deployment key: it reads only the staging directory, mounted at /backup, and the repo passwords
# and backend credentials in its environment. It runs as nixie's user, so the files it writes in
# staging are ones nixie can remove. The nixie-backup command on the PATH runs the job's commands.
# Build it from the repository root:
#   docker build -f apps/backup-job/Dockerfile -t nixie-backup .

FROM oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS build
WORKDIR /repo
COPY . .

RUN bun install --frozen-lockfile --ignore-scripts \
  && bun build apps/backup-job/src/main.ts --target bun --define NIXIE_TEST_BUILD=false \
    --outfile /out/app/main.js

# bzip2 unpacks an archive only after its checksum passes, so the unpinned package never decides
# which restic the image holds
RUN apt-get update \
  && apt-get install -y --no-install-recommends bzip2 \
  && rm -rf /var/lib/apt/lists/*

# each pinned binary, checked against the checksum the repo recorded, never one fetched with it
RUN mkdir -p /out/bin \
  && grep -v '^#' apps/backup-job/binaries.txt | while read -r name version url sum; do \
    URL="$url" OUT="/tmp/$name.bz2" bun -e 'await Bun.write(process.env.OUT, await fetch(process.env.URL))' \
    && echo "$sum  /tmp/$name.bz2" | sha256sum -c - \
    && bunzip2 -c "/tmp/$name.bz2" > "/out/bin/$name" \
    && chmod 0755 "/out/bin/$name" \
    && "/out/bin/$name" version | grep -q " $version " \
    || exit 1; \
  done

FROM oven/bun:1.4.3-slim@sha256:14a223fa35747ec728bce300ef85888bc5f7958164d15bbba6a54b22b52a3288
COPY --from=build /out/bin/restic /usr/local/bin/restic
COPY --from=build /out/app/ /app/

RUN printf '#!/bin/sh\nexec bun /app/main.js "$@"\n' > /usr/local/bin/nixie-backup \
  && chmod 0755 /usr/local/bin/nixie-backup
RUN groupadd --gid 10001 nixie \
  && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin nixie
USER 10001:10001
WORKDIR /app
ENV NIXIE_BACKUP_STAGING_DIR=/backup
VOLUME /backup

ENTRYPOINT ["bun", "/app/main.js"]
CMD ["run"]
