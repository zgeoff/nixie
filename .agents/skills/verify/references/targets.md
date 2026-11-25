# Targets

Start a target, and read what it allows.

| Target    | Start with                                                  | Access     | Notes                                                    |
| --------- | ----------------------------------------------------------- | ---------- | -------------------------------------------------------- |
| `local`   | `bun verify use --target local`, then `bun verify up`       | read-write | Test build, scripted model.                              |
| `preview` | `bun verify use --target preview`, then `bun verify attach` | read-write | The PR's preview, real model; [setup](preview-setup.md). |
| `prod`    | `bun verify use --target prod`, then `bun verify attach`    | read-only  | [The prod check](prod-check.md).                         |
