# The nixie-backup image: the backup job bundled with bun build on a slim Bun base, and the restic
# binary at the version and checksum that binaries.txt pins. It opens no database and holds no
# deployment key: it reads only the staging directory, mounted at /backup, and the repo passwords
# and backend credentials in its environment. It runs as nixie's user, so the files it writes in
# staging are ones nixie can remove. The nixie-backup command on the PATH runs the job's commands.
# Build it from the repository root:
#   docker build -f apps/backup-job/Dockerfile -t nixie-backup .

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
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

# each pinned binary, checked against the checksum the repo recorded, never one fetched with it;
# a release download can answer HTTP 504 for a while, so each download tries 4 times
RUN mkdir -p /out/bin \
  && grep -v '^#' apps/backup-job/binaries.txt | while read -r name version url sum; do \
    for attempt in 1 2 3 4; do \
      URL="$url" OUT="/tmp/$name.bz2" bun -e 'const response = await fetch(process.env.URL); if (!response.ok) throw new Error(`${process.env.URL} answered HTTP ${response.status}`); await Bun.write(process.env.OUT, response)' \
        && break; \
      [ "$attempt" -lt 4 ] && sleep $((attempt * 10)) || exit 1; \
    done \
    && echo "$sum  /tmp/$name.bz2" | sha256sum -c - \
    && bunzip2 -c "/tmp/$name.bz2" > "/out/bin/$name" \
    && chmod 0755 "/out/bin/$name" \
    && "/out/bin/$name" version | grep -q " $version " \
    || exit 1; \
  done

FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4
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
