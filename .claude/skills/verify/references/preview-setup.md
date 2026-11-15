# The preview setup

The `preview` target runs the pushed commit of the pull request in an imp, a small VM, on a machine
you reach over SSH.

- Set `NIXIE_PREVIEW_SSH` to the machine's SSH destination, and `NIXIE_PREVIEW_IMP_EXEC` to the
  words that start a command in an imp there. Ask the repo's maintainer for both.
- `attach` fails with `environment` while the preview builds. Run it again.
- `doctor` fails when the preview serves another tree than `HEAD`. Push, then attach again.
- `action reset-data` empties the preview's data and keeps the sign-in.
