# Vendoring a skill

A vendored skill is a copy of someone else's skill in your definitions repo, pinned to the upstream
commit it came from and to the content hash of its folder. The pin lives in
`skills/skills.lock.json`, and the seed refuses a snapshot in which a vendored skill's files differ
from its pin, so a change to the skill reaches nixie only through a pull request you merge. nixie
never installs a skill from a registry, so vendoring is the one way a published skill reaches it.
[The definitions](../architecture/core/definitions.md#skills) covers every check the seed runs on a
skill.

## Before you start

- A checkout of your definitions repo whose `nixie.yaml` holds `format: 2`. Format 1 lists every
  file under `skills/` as unapplied.
- bash with GNU `find`, `sort` and `sha256sum`. On macOS, install coreutils, or swap `sha256sum` for
  `shasum -a 256`.

## Steps

1. Copy the skill's folder from the upstream repo at a full commit SHA into `skills/<name>/`, with
   LF line endings. The folder name must match the `name` field in the skill's `SKILL.md`.

   ```bash
   git -C <upstream_checkout> checkout <full_commit_sha>
   cp -R <upstream_checkout>/skills/<name> skills/<name>
   ```

2. Compute the folder's content hash from the definitions root. The parentheses run the hash in a
   subshell inside the folder, so your shell stays at the root:

   ```bash
   ( cd skills/<name>
     { printf 'nixie-definitions-v1\n'
       find . -type f ! -path '*/.*' | sed 's|^\./||' | LC_ALL=C sort | while IFS= read -r f; do
         printf '%s\t%s\t%s\n' "$f" "$(wc -c < "$f" | tr -d ' ')" "$(sha256sum "$f" | cut -d' ' -f1)"
       done; } | sha256sum | cut -d' ' -f1 )
   ```

   Expect: one line of 64 hex characters.

3. Add the skill's entry to `skills/skills.lock.json`, with the upstream URL, the folder's path
   upstream, the commit and the hash from step 2:

   ```json
   {
     "pdf-forms": {
       "source": "https://github.com/example/skills",
       "path": "skills/pdf-forms",
       "commit": "<full_commit_sha>",
       "contentHash": "<content_hash>"
     }
   }
   ```

4. Open a pull request on your definitions repo, and review the skill in it before you merge. Read
   its scripts for commands that install a package or reach the network, and its text for URLs and
   addresses. A code run has no network, so a script that installs a package fails anyway, and the
   skill's `compatibility` field shows what it expects.

5. Merge the pull request.

   Expect: the next seed's record lists the skill among the added skills. A refused seed keeps the
   definitions in force and names each file at fault.

nixie requires no publisher signature. The pin and your review of the pull request stand in for one.

## Updating a vendored skill

Remove the old folder before you copy the new commit's folder, so a file that upstream deleted
leaves too and the copy lands at `skills/<name>/` instead of inside the old folder:

```bash
git -C <upstream_checkout> checkout <full_commit_sha>
rm -rf skills/<name>
cp -R <upstream_checkout>/skills/<name> skills/<name>
```

Then follow steps 2 to 5, and replace the skill's lock entry with the new one. A changed file with
the old entry makes the seed refuse the snapshot, so an edit to a vendored skill always goes through
a new pin. To make the skill your own instead, remove its lock entry: a skill with no entry is
yours.
