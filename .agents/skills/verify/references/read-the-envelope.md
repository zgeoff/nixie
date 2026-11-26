# Read the envelope

Each command prints one JSON envelope as its last line, or text with `--human`, or the short line of
`--brief` below. `doctor` and other streaming commands print JSON event lines first.

Add `--brief` to print one short line and no event lines. Use it when you only need to know whether
the command passed. The line holds:

- `<command> ok=<true|false>`;
- `error.code` and `error.message` on failure, or `data` on success, each cut at 200 characters;
- `truncatedPath`, when the data was too large;
- `evidence=<count>`.

`--brief` leaves out `error.hint`. Run the command again without `--brief` to read the hint.

Read these fields:

- `ok`, then `data` on success, or `error.code`, `error.message` and `error.hint` on failure;
- `evidence`: the files the command kept, under `.wringer/`;
- `truncatedPath`: the file that holds `data` when it was too large to print.

When a command fails, find its exit code and `error.code` in [Exit codes](exit-codes.md), and do
what that row says.
