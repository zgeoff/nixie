# Attach to a preview

Push your commits and open the pull request first. The preview builds only the pull request's head
commit.

The preview service comments a link on each pull request. `bun verify attach` opens that link, and
opening it starts a build of the head commit in an imp, a small VM, on the preview machine. The
preview keeps one imp per pull request, so its data is yours alone.

## Set it up

Ask your caller for these two values, and pass both to every `bun verify` command, such as by an
`export` in the same shell call. Without them, report the preview check as blocked.

| Variable                 | Holds                                                                                                              | Example             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `NIXIE_PREVIEW_SSH`      | the SSH destination of the preview machine                                                                         | `ops@imp-host.test` |
| `NIXIE_PREVIEW_IMP_EXEC` | the words that start a command in an imp, without the imp's name; `bun verify` adds the name, `--` and its command | `impctl exec`       |

## Attach

1. Run `bun verify use --target preview`.
2. Run `bun verify attach`. Expect: `ok: true`.
3. When `attach` fails with `error.code` `environment`, read its message:
   - No preview comment yet, or a link that is not ready: the preview is building. Run `attach`
     again each minute. After 15 minutes from the first `attach`, tell your caller the preview never
     built.
   - A missing variable: go back to [Set it up](#set-it-up).
4. Run `bun verify doctor`. Expect: `data.passed: true`.
5. When `doctor` says the preview serves another commit than `HEAD`, push `HEAD` if you have not,
   then run `attach` again. A new push starts a new build.

## Empty the data

Run `bun verify action reset-data` after `doctor` passes, when a feature file says to start with no
messages. It keeps the browser's sign-in.
