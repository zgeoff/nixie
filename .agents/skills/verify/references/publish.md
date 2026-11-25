# Publish the report

Publish the report into the PR's description, even when you skipped a feature. `publish` uploads the
evidence files to `CLOUD_FILES_URL`, and writes the report into the description, the only report the
gate reads.

1. Check that the session's environment sets `CLOUD_FILES_URL` and `CLOUD_FILES_TOKEN_REF`.
   `CLOUD_FILES_TOKEN_REF` is the 1Password `op://` reference to the upload token. When either is
   empty, stop and report a blocker.
2. Read the token in a subshell, so it never sits in your shell. A failed `op read` stops the
   command before `publish` runs. Never run `op read` on its own: it prints the token.

   ```bash
   (CLOUD_FILES_TOKEN="$(op read "$CLOUD_FILES_TOKEN_REF")" && export CLOUD_FILES_TOKEN && bun verify publish)
   ```

   To write to another PR, add `--pr <number>`. When `op read` fails, stop and report a blocker.

3. Expect: `ok: true`, `data.action` of `created`, `replaced` or `unchanged`, and `data.local` of 0.
   Each file that `data.local` counts stayed on your machine, where a reviewer can't open it.
