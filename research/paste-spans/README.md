# Spike: which spans of a message you pasted

This spike records, in a text box, which spans of a message you typed and which arrived by paste,
drop or another route, and keeps those spans correct through later edits. The memory write rules of
[0011](../../docs/decisions/0011-memory-writes.md) need the record, because a quote from a pasted
span never counts as your evidence. The page runs the span logic that the web client ships.

## Question

Can a text box in the web client tell typed text from pasted text reliably, keep the spans right
when you edit around and inside a paste, and fail closed when it cannot tell? Does any keyboard path
on an Android phone insert pasted text that the client labels as typed?

## Answer

- Chromium, Firefox and WebKit label a paste right and keep the spans right through every edit.
- The label comes from `inputType`, and every input type outside the typed list becomes `unknown`.
- On Android, Gboard's clipboard chip and Gboard's own undo insert pasted text as one `insertText`,
  which the first run labelled `typed`.
- A rule that one `insertText` of more than one word counts as `unknown` caught both, and a second
  run confirmed it, once Gboard's split of a run-together word counted as typed.
- React Native's `TextInput` has no paste event, so a multi-character insertion that no native hook
  named counts as `unknown` there.

Label by `inputType`, fail closed to `unknown`, and treat a multi-word `insertText` as `unknown`.

## Run it

```bash
bun install
docker run --rm --ipc=host -v "$(git rev-parse --show-toplevel)":/repo \
  -v "$(command -v bun)":/usr/local/bin/bun:ro -w /repo/research/paste-spans \
  mcr.microsoft.com/playwright:v1.61.0-noble bun browser.ts
```

The [setup](results.md#setup) gives the versions, the reason for Playwright's image, and the device
run on an Android phone.

## Results

The [results](results.md) hold the spans each browser and each Gboard path printed, the client fix,
the second Android run and the React Native routes.

## Untested

Voice typing, keyboards other than Gboard, and any React Native input on a device. The
[untested list](results.md#untested) gives the rest.
